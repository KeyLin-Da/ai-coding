package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ArtifactMapper;
import com.opp.aidelivery.center.mapper.ImportItemMapper;
import com.opp.aidelivery.center.mapper.ImportSessionMapper;
import com.opp.aidelivery.center.mapper.IssueMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.ReviewMapper;
import com.opp.aidelivery.center.mapper.RunEventMapper;
import com.opp.aidelivery.center.mapper.RunMapper;
import com.opp.aidelivery.center.mapper.WorkflowStageMapper;
import com.opp.aidelivery.center.model.dto.ImportRecordsRequest;
import com.opp.aidelivery.center.model.dto.ImportSessionCreateRequest;
import com.opp.aidelivery.center.model.entity.ArtifactEntity;
import com.opp.aidelivery.center.model.entity.ImportItemEntity;
import com.opp.aidelivery.center.model.entity.ImportSessionEntity;
import com.opp.aidelivery.center.model.entity.IssueEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.ReviewEntity;
import com.opp.aidelivery.center.model.entity.RunEntity;
import com.opp.aidelivery.center.model.entity.RunEventEntity;
import com.opp.aidelivery.center.model.entity.WorkflowStageEntity;
import com.opp.aidelivery.center.model.vo.ImportRecordResultVO;
import com.opp.aidelivery.center.model.vo.ImportRecordsResultVO;
import com.opp.aidelivery.center.model.vo.ImportSessionVO;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ImportService {

    private static final String STATUS_IMPORTED = "IMPORTED";
    private static final String STATUS_DUPLICATED = "DUPLICATED";
    private static final String STATUS_CONFLICTED = "CONFLICTED";
    private static final String STATUS_FAILED = "FAILED";
    private static final String STATUS_SKIPPED = "SKIPPED";

    private final PermissionService permissionService;
    private final ImportSessionMapper importSessionMapper;
    private final ImportItemMapper importItemMapper;
    private final RequirementMapper requirementMapper;
    private final WorkflowStageMapper workflowStageMapper;
    private final ReviewMapper reviewMapper;
    private final IssueMapper issueMapper;
    private final RunMapper runMapper;
    private final RunEventMapper runEventMapper;
    private final ArtifactMapper artifactMapper;

    @Transactional(rollbackFor = Exception.class)
    public ImportSessionVO createSession(Long userId, ImportSessionCreateRequest request) {
        permissionService.assertProjectMember(userId, request.getProjectId());
        ImportSessionEntity session = new ImportSessionEntity();
        session.setProjectId(request.getProjectId());
        session.setMode(Boolean.TRUE.equals(request.getDryRun()) ? "DRY_RUN" : normalize(request.getMode(), "IMPORT"));
        session.setStatus("RUNNING");
        session.setSource(normalize(request.getSource(), "LOCAL_BOOTSTRAP"));
        session.setManifestSha256(request.getManifestSha256());
        session.setTotalCount(0);
        session.setImportedCount(0);
        session.setSkippedCount(0);
        session.setFailedCount(0);
        session.setDuplicatedCount(0);
        session.setConflictedCount(0);
        session.setCreatedBy(userId);
        importSessionMapper.insert(session);
        return toVO(session);
    }

    public ImportSessionVO getSession(Long userId, Long sessionId) {
        ImportSessionEntity session = loadSession(userId, sessionId);
        return toVO(session);
    }

    @Transactional(rollbackFor = Exception.class)
    public ImportRecordsResultVO importRecords(Long userId, Long sessionId, ImportRecordsRequest request) {
        ImportSessionEntity session = loadRunnableSession(userId, sessionId);
        ImportRecordsResultVO result = new ImportRecordsResultVO();
        List<ImportRecordResultVO> results = new ArrayList<>();
        for (ImportRecordsRequest.RequirementImportRequest item : request.getRequirements()) {
            results.add(importRequirement(userId, session, item));
        }
        for (ImportRecordsRequest.ArtifactImportRequest item : request.getArtifacts()) {
            results.add(importArtifact(session, item));
        }
        for (ImportRecordsRequest.StageImportRequest item : request.getStages()) {
            results.add(importStage(session, item));
        }
        for (ImportRecordsRequest.ReviewImportRequest item : request.getReviews()) {
            results.add(importReview(userId, session, item));
        }
        for (ImportRecordsRequest.IssueImportRequest item : request.getIssues()) {
            results.add(importIssue(session, item));
        }
        for (ImportRecordsRequest.RunImportRequest item : request.getRuns()) {
            results.add(importRun(session, item));
        }
        for (ImportRecordsRequest.RunEventImportRequest item : request.getRunEvents()) {
            results.add(importRunEvent(session, item));
        }
        result.setResults(results);
        summarizeResults(result, results);
        refreshSessionCounts(session);
        return result;
    }

    @Transactional(rollbackFor = Exception.class)
    public ImportSessionVO completeSession(Long userId, Long sessionId) {
        ImportSessionEntity session = loadRunnableSession(userId, sessionId);
        refreshSessionCounts(session);
        if (session.getFailedCount() != null && session.getFailedCount() > 0) {
            session.setStatus("FAILED");
            session.setErrorMessage("导入存在失败记录");
        } else {
            session.setStatus("COMPLETED");
        }
        importSessionMapper.updateById(session);
        return toVO(session);
    }

    private ImportRecordResultVO importRequirement(Long userId, ImportSessionEntity session, ImportRecordsRequest.RequirementImportRequest item) {
        String sourceKey = "REQUIREMENT:" + item.getRequirementId();
        ImportRecordResultVO existingItem = duplicateItemResult(session.getId(), "REQUIREMENT", sourceKey);
        if (existingItem != null) {
            return existingItem;
        }
        assertSafeSource(sourceKey);
        assertSafeSource(item.getBranchName());
        RequirementEntity requirement = requirementMapper.selectOne(new LambdaQueryWrapper<RequirementEntity>()
            .eq(RequirementEntity::getProjectId, session.getProjectId())
            .eq(RequirementEntity::getRequirementId, item.getRequirementId())
            .last("LIMIT 1"));
        if (requirement == null) {
            requirement = new RequirementEntity();
            requirement.setProjectId(session.getProjectId());
            requirement.setRequirementId(item.getRequirementId());
            requirement.setCreatedBy(userId);
            requirement.setVersion(0L);
        }
        requirement.setTitle(item.getTitle());
        requirement.setRequirementType(normalizeRequirementType(item.getRequirementType()));
        requirement.setBranchName(trimToNull(item.getBranchName()));
        requirement.setCurrentStage(normalize(item.getCurrentStage(), "PRD"));
        requirement.setStatus(normalize(item.getStatus(), "DRAFT"));
        if (requirement.getId() == null) {
            requirementMapper.insert(requirement);
        } else {
            requirementMapper.updateById(requirement);
        }
        ensureDefaultStages(requirement);
        return saveItem(session.getId(), "REQUIREMENT", sourceKey, null, "REQUIREMENT", requirement.getId(), STATUS_IMPORTED, null);
    }

    private ImportRecordResultVO importStage(ImportSessionEntity session, ImportRecordsRequest.StageImportRequest item) {
        String sourceKey = "STAGE:" + item.getRequirementId() + ":" + item.getStage();
        ImportRecordResultVO existingItem = duplicateItemResult(session.getId(), "STAGE", sourceKey);
        if (existingItem != null) {
            return existingItem;
        }
        assertSafeSource(sourceKey);
        assertSafeSource(item.getArtifactLogicalPath());
        RequirementEntity requirement = loadRequirement(session.getProjectId(), item.getRequirementId());
        ArtifactEntity artifact = item.getArtifactLogicalPath() == null ? null : findArtifact(requirement.getId(), item.getArtifactLogicalPath());
        WorkflowStageEntity stage = workflowStageMapper.selectOne(new LambdaQueryWrapper<WorkflowStageEntity>()
            .eq(WorkflowStageEntity::getRequirementPk, requirement.getId())
            .eq(WorkflowStageEntity::getStage, item.getStage())
            .last("LIMIT 1"));
        if (stage != null && "APPROVED".equals(stage.getStatus()) && !"APPROVED".equals(item.getStatus())) {
            return saveItem(session.getId(), "STAGE", sourceKey, null, "WORKFLOW_STAGE", stage.getId(), STATUS_CONFLICTED, "中心阶段已通过，拒绝回退导入状态");
        }
        if (stage == null) {
            stage = new WorkflowStageEntity();
            stage.setRequirementPk(requirement.getId());
            stage.setStage(item.getStage());
            stage.setVersion(0L);
        }
        stage.setStatus(normalize(item.getStatus(), "NOT_STARTED"));
        stage.setArtifactId(artifact == null ? stage.getArtifactId() : artifact.getId());
        stage.setApprovedAt(item.getApprovedAt());
        stage.setRejectedAt(item.getRejectedAt());
        stage.setComment(item.getComment());
        if (stage.getId() == null) {
            workflowStageMapper.insert(stage);
        } else {
            workflowStageMapper.updateById(stage);
        }
        return saveItem(session.getId(), "STAGE", sourceKey, null, "WORKFLOW_STAGE", stage.getId(), STATUS_IMPORTED, null);
    }

    private ImportRecordResultVO importArtifact(ImportSessionEntity session, ImportRecordsRequest.ArtifactImportRequest item) {
        String sourceKey = "ARTIFACT:" + item.getRequirementId() + ":" + item.getLogicalPath();
        if (item.getSha256() != null) {
            sourceKey += ":" + item.getSha256();
        }
        ImportRecordResultVO existingItem = duplicateItemResult(session.getId(), "ARTIFACT", sourceKey);
        if (existingItem != null) {
            return existingItem;
        }
        assertSafeSource(sourceKey);
        assertSafeSource(item.getLogicalPath());
        RequirementEntity requirement = loadRequirement(session.getProjectId(), item.getRequirementId());
        ArtifactEntity artifact = findArtifact(requirement.getId(), item.getLogicalPath());
        if (artifact == null) {
            artifact = new ArtifactEntity();
            artifact.setRequirementPk(requirement.getId());
            artifact.setLogicalPath(item.getLogicalPath());
            artifact.setVersion(0L);
        }
        artifact.setLabel(item.getLabel());
        artifact.setKind(item.getKind());
        artifact.setStage(item.getStage());
        if (artifact.getId() == null) {
            artifactMapper.insert(artifact);
        } else {
            artifactMapper.updateById(artifact);
        }
        ImportRecordResultVO result = saveItem(
            session.getId(),
            "ARTIFACT",
            sourceKey,
            item.getSha256(),
            "ARTIFACT",
            artifact.getId(),
            STATUS_IMPORTED,
            null
        );
        result.setArtifactId(artifact.getId());
        return result;
    }

    private ImportRecordResultVO importReview(Long userId, ImportSessionEntity session, ImportRecordsRequest.ReviewImportRequest item) {
        ImportRecordResultVO existingItem = duplicateItemResult(session.getId(), "REVIEW", item.getSourceKey());
        if (existingItem != null) {
            return existingItem;
        }
        assertSafeSource(item.getSourceKey());
        RequirementEntity requirement = loadRequirement(session.getProjectId(), item.getRequirementId());
        ReviewEntity review = new ReviewEntity();
        review.setRequirementPk(requirement.getId());
        review.setStage(item.getStage());
        review.setImplementationStep(item.getImplementationStep());
        review.setDecision(item.getDecision());
        review.setComment(item.getComment());
        review.setActorId(item.getActorId() == null ? userId : item.getActorId());
        review.setArtifactVersionId(item.getArtifactVersionId());
        reviewMapper.insert(review);
        return saveItem(session.getId(), "REVIEW", item.getSourceKey(), null, "REVIEW", review.getId(), STATUS_IMPORTED, null);
    }

    private ImportRecordResultVO importIssue(ImportSessionEntity session, ImportRecordsRequest.IssueImportRequest item) {
        ImportRecordResultVO existingItem = duplicateItemResult(session.getId(), "ISSUE", item.getSourceKey());
        if (existingItem != null) {
            return existingItem;
        }
        assertSafeSource(item.getSourceKey());
        RequirementEntity requirement = loadRequirement(session.getProjectId(), item.getRequirementId());
        IssueEntity issue = new IssueEntity();
        issue.setRequirementPk(requirement.getId());
        issue.setSeverity(item.getSeverity());
        issue.setStatus(normalize(item.getStatus(), "OPEN"));
        issue.setTitle(item.getTitle());
        issue.setRecommendation(item.getRecommendation());
        issue.setSourceArtifactVersionId(item.getSourceArtifactVersionId());
        issue.setAssigneeId(item.getAssigneeId());
        issueMapper.insert(issue);
        return saveItem(session.getId(), "ISSUE", item.getSourceKey(), null, "ISSUE", issue.getId(), STATUS_IMPORTED, null);
    }

    private ImportRecordResultVO importRun(ImportSessionEntity session, ImportRecordsRequest.RunImportRequest item) {
        ImportRecordResultVO existingItem = duplicateItemResult(session.getId(), "RUN", item.getSourceKey());
        if (existingItem != null) {
            return existingItem;
        }
        assertSafeSource(item.getSourceKey());
        RequirementEntity requirement = loadRequirement(session.getProjectId(), item.getRequirementId());
        RunEntity run = new RunEntity();
        run.setJobId(item.getJobId() == null ? 0L : item.getJobId());
        run.setRequirementPk(requirement.getId());
        run.setStatus(normalize(item.getStatus(), "SUCCEEDED"));
        run.setClientSessionId(item.getClientSessionId());
        run.setAgentId(item.getAgentId());
        run.setStartedAt(item.getStartedAt() == null ? LocalDateTime.now() : item.getStartedAt());
        run.setFinishedAt(item.getFinishedAt());
        run.setErrorMessage(item.getErrorMessage());
        runMapper.insert(run);
        return saveItem(session.getId(), "RUN", item.getSourceKey(), null, "RUN", run.getId(), STATUS_IMPORTED, null);
    }

    private ImportRecordResultVO importRunEvent(ImportSessionEntity session, ImportRecordsRequest.RunEventImportRequest item) {
        ImportRecordResultVO existingItem = duplicateItemResult(session.getId(), "RUN_EVENT", item.getSourceKey());
        if (existingItem != null) {
            return existingItem;
        }
        assertSafeSource(item.getSourceKey());
        assertSafeSource(item.getRunSourceKey());
        ImportItemEntity runItem = findItem(session.getId(), "RUN", item.getRunSourceKey());
        if (runItem == null || runItem.getTargetId() == null) {
            return saveItem(session.getId(), "RUN_EVENT", item.getSourceKey(), null, "RUN_EVENT", null, STATUS_SKIPPED, "来源 run 尚未导入");
        }
        RunEventEntity event = runEventMapper.selectOne(new LambdaQueryWrapper<RunEventEntity>()
            .eq(RunEventEntity::getRunId, runItem.getTargetId())
            .eq(RunEventEntity::getSeq, item.getSeq())
            .last("LIMIT 1"));
        if (event == null) {
            event = new RunEventEntity();
            event.setRunId(runItem.getTargetId());
            event.setSeq(item.getSeq());
        }
        event.setLevel(item.getLevel());
        event.setType(item.getType());
        event.setMessage(item.getMessage());
        event.setPayloadJson(item.getPayloadJson());
        if (event.getId() == null) {
            runEventMapper.insert(event);
        } else {
            runEventMapper.updateById(event);
        }
        return saveItem(session.getId(), "RUN_EVENT", item.getSourceKey(), null, "RUN_EVENT", event.getId(), STATUS_IMPORTED, null);
    }

    private void ensureDefaultStages(RequirementEntity requirement) {
        for (String stageName : new String[] {"PRD", "TECH_DESIGN", "IMPLEMENTATION", "CODE_REVIEW"}) {
            WorkflowStageEntity stage = workflowStageMapper.selectOne(new LambdaQueryWrapper<WorkflowStageEntity>()
                .eq(WorkflowStageEntity::getRequirementPk, requirement.getId())
                .eq(WorkflowStageEntity::getStage, stageName)
                .last("LIMIT 1"));
            if (stage == null) {
                stage = new WorkflowStageEntity();
                stage.setRequirementPk(requirement.getId());
                stage.setStage(stageName);
                stage.setStatus(stageName.equals(requirement.getCurrentStage()) ? "DRAFT" : "NOT_STARTED");
                stage.setVersion(0L);
                workflowStageMapper.insert(stage);
            }
        }
    }

    private ImportRecordResultVO saveItem(
        Long sessionId,
        String itemType,
        String sourceKey,
        String sourceSha256,
        String targetType,
        Long targetId,
        String status,
        String message
    ) {
        ImportItemEntity item = findItem(sessionId, itemType, sourceKey);
        if (item == null) {
            item = new ImportItemEntity();
            item.setImportSessionId(sessionId);
            item.setItemType(itemType);
            item.setSourceKey(sourceKey);
        }
        item.setSourceSha256(sourceSha256);
        item.setTargetType(targetType);
        item.setTargetId(targetId);
        item.setStatus(status);
        item.setErrorMessage(message);
        if (item.getId() == null) {
            importItemMapper.insert(item);
        } else {
            importItemMapper.updateById(item);
        }
        return toResult(item);
    }

    private ImportRecordResultVO duplicateItemResult(Long sessionId, String itemType, String sourceKey) {
        ImportItemEntity existing = findItem(sessionId, itemType, sourceKey);
        if (existing == null) {
            return null;
        }
        ImportRecordResultVO result = toResult(existing);
        result.setStatus(STATUS_DUPLICATED);
        result.setMessage(existing.getErrorMessage() == null ? "导入记录已处理" : existing.getErrorMessage());
        return result;
    }

    private ImportItemEntity findItem(Long sessionId, String itemType, String sourceKey) {
        return importItemMapper.selectOne(new LambdaQueryWrapper<ImportItemEntity>()
            .eq(ImportItemEntity::getImportSessionId, sessionId)
            .eq(ImportItemEntity::getItemType, itemType)
            .eq(ImportItemEntity::getSourceKey, sourceKey)
            .last("LIMIT 1"));
    }

    private RequirementEntity loadRequirement(Long projectId, String requirementId) {
        RequirementEntity requirement = requirementMapper.selectOne(new LambdaQueryWrapper<RequirementEntity>()
            .eq(RequirementEntity::getProjectId, projectId)
            .eq(RequirementEntity::getRequirementId, requirementId)
            .last("LIMIT 1"));
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在: " + requirementId);
        }
        return requirement;
    }

    private ArtifactEntity findArtifact(Long requirementPk, String logicalPath) {
        return artifactMapper.selectOne(new LambdaQueryWrapper<ArtifactEntity>()
            .eq(ArtifactEntity::getRequirementPk, requirementPk)
            .eq(ArtifactEntity::getLogicalPath, logicalPath)
            .last("LIMIT 1"));
    }

    private ImportSessionEntity loadSession(Long userId, Long sessionId) {
        ImportSessionEntity session = importSessionMapper.selectById(sessionId);
        if (session == null) {
            throw new BusinessException(AiDeliveryErrorCode.IMPORT_SESSION_INVALID);
        }
        try {
            permissionService.assertProjectMember(userId, session.getProjectId());
        } catch (BusinessException ex) {
            if (ex.getErrorCode() == AiDeliveryErrorCode.ACCESS_DENIED) {
                throw new BusinessException(AiDeliveryErrorCode.IMPORT_PROJECT_DENIED);
            }
            throw ex;
        }
        return session;
    }

    private ImportSessionEntity loadRunnableSession(Long userId, Long sessionId) {
        ImportSessionEntity session = loadSession(userId, sessionId);
        if (!"RUNNING".equals(session.getStatus())) {
            throw new BusinessException(AiDeliveryErrorCode.IMPORT_SESSION_INVALID);
        }
        return session;
    }

    private void refreshSessionCounts(ImportSessionEntity session) {
        List<ImportItemEntity> items = importItemMapper.selectList(new LambdaQueryWrapper<ImportItemEntity>()
            .eq(ImportItemEntity::getImportSessionId, session.getId()));
        Map<String, Long> counts = items.stream().collect(Collectors.groupingBy(ImportItemEntity::getStatus, Collectors.counting()));
        session.setTotalCount(items.size());
        session.setImportedCount(count(counts, STATUS_IMPORTED));
        session.setSkippedCount(count(counts, STATUS_SKIPPED));
        session.setFailedCount(count(counts, STATUS_FAILED));
        session.setDuplicatedCount(count(counts, STATUS_DUPLICATED));
        session.setConflictedCount(count(counts, STATUS_CONFLICTED));
        importSessionMapper.updateById(session);
    }

    private int count(Map<String, Long> counts, String status) {
        return Math.toIntExact(counts.getOrDefault(status, 0L));
    }

    private void summarizeResults(ImportRecordsResultVO result, List<ImportRecordResultVO> results) {
        Map<String, Long> counts = results.stream().collect(Collectors.groupingBy(ImportRecordResultVO::getStatus, Collectors.counting()));
        result.setImportedCount(count(counts, STATUS_IMPORTED));
        result.setSkippedCount(count(counts, STATUS_SKIPPED));
        result.setFailedCount(count(counts, STATUS_FAILED));
        result.setDuplicatedCount(count(counts, STATUS_DUPLICATED));
        result.setConflictedCount(count(counts, STATUS_CONFLICTED));
    }

    private void assertSafeSource(String value) {
        if (value == null || value.trim().isEmpty()) {
            return;
        }
        String normalized = value.replace('\\', '/');
        String lower = normalized.toLowerCase(Locale.ROOT);
        if (normalized.startsWith("/") || normalized.startsWith("//") || normalized.matches("^[A-Za-z]:/.*") || normalized.contains("../")) {
            throw new BusinessException(AiDeliveryErrorCode.IMPORT_PAYLOAD_UNSAFE, "导入 payload 包含本地绝对路径或越级路径");
        }
        if (lower.contains(".env") || lower.contains("secret") || lower.contains("password") || lower.contains("private-key")) {
            throw new BusinessException(AiDeliveryErrorCode.IMPORT_PAYLOAD_UNSAFE, "导入 payload 包含敏感字段");
        }
    }

    private String normalizeRequirementType(String value) {
        return "DEFECT".equals(value) ? "DEFECT" : "REQUIREMENT";
    }

    private String normalize(String value, String defaultValue) {
        if (value == null || value.trim().isEmpty()) {
            return defaultValue;
        }
        return value.trim().toUpperCase(Locale.ROOT);
    }

    private String trimToNull(String value) {
        if (value == null || value.trim().isEmpty()) {
            return null;
        }
        return value.trim();
    }

    private ImportRecordResultVO toResult(ImportItemEntity entity) {
        ImportRecordResultVO vo = new ImportRecordResultVO();
        vo.setItemType(entity.getItemType());
        vo.setSourceKey(entity.getSourceKey());
        vo.setStatus(entity.getStatus());
        vo.setTargetType(entity.getTargetType());
        vo.setTargetId(entity.getTargetId());
        vo.setMessage(entity.getErrorMessage());
        if ("ARTIFACT".equals(entity.getTargetType())) {
            vo.setArtifactId(entity.getTargetId());
        }
        if ("ARTIFACT_VERSION".equals(entity.getTargetType())) {
            vo.setExistingVersionId(entity.getTargetId());
        }
        return vo;
    }

    private ImportSessionVO toVO(ImportSessionEntity entity) {
        ImportSessionVO vo = new ImportSessionVO();
        vo.setId(entity.getId());
        vo.setProjectId(entity.getProjectId());
        vo.setMode(entity.getMode());
        vo.setStatus(entity.getStatus());
        vo.setSource(entity.getSource());
        vo.setManifestSha256(entity.getManifestSha256());
        vo.setTotalCount(defaultInt(entity.getTotalCount()));
        vo.setImportedCount(defaultInt(entity.getImportedCount()));
        vo.setSkippedCount(defaultInt(entity.getSkippedCount()));
        vo.setFailedCount(defaultInt(entity.getFailedCount()));
        vo.setDuplicatedCount(defaultInt(entity.getDuplicatedCount()));
        vo.setConflictedCount(defaultInt(entity.getConflictedCount()));
        vo.setErrorMessage(entity.getErrorMessage());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }

    private int defaultInt(Integer value) {
        return value == null ? 0 : value;
    }
}
