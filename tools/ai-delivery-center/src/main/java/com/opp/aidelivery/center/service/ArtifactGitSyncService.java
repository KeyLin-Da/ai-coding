package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ArtifactGitVersionMapper;
import com.opp.aidelivery.center.mapper.ArtifactMapper;
import com.opp.aidelivery.center.mapper.ArtifactSyncMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.UserProjectRepoStateMapper;
import com.opp.aidelivery.center.model.dto.ArtifactGitSyncBlockedRequest;
import com.opp.aidelivery.center.model.dto.ArtifactGitSyncCompleteRequest;
import com.opp.aidelivery.center.model.dto.ArtifactGitSyncFileRequest;
import com.opp.aidelivery.center.model.dto.ArtifactGitSyncReviewRequest;
import com.opp.aidelivery.center.model.dto.StageReviewRequest;
import com.opp.aidelivery.center.model.entity.ArtifactEntity;
import com.opp.aidelivery.center.model.entity.ArtifactGitVersionEntity;
import com.opp.aidelivery.center.model.entity.ArtifactSyncEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.UserProjectRepoStateEntity;
import com.opp.aidelivery.center.model.vo.ArtifactGitSyncCompleteVO;
import com.opp.aidelivery.center.model.vo.ArtifactGitVersionVO;
import com.opp.aidelivery.center.model.vo.ArtifactSyncVO;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ArtifactGitSyncService {

    private static final Set<String> AGENT_SKILL_PREFIXES = Collections.unmodifiableSet(
        new HashSet<>(Arrays.asList(
            ".codex/skills/",
            ".codebuddy/skills/",
            ".qoder/skills/",
            ".qwen/skills/"
        ))
    );

    private final PermissionService permissionService;
    private final RequirementMapper requirementMapper;
    private final ArtifactMapper artifactMapper;
    private final ArtifactGitVersionMapper artifactGitVersionMapper;
    private final ArtifactSyncMapper artifactSyncMapper;
    private final UserProjectRepoStateMapper userProjectRepoStateMapper;
    private final DomainEventService domainEventService;
    private final ReviewService reviewService;

    @Transactional(rollbackFor = Exception.class)
    public ArtifactSyncVO blocked(Long userId, Long requirementPk, ArtifactGitSyncBlockedRequest request) {
        RequirementEntity requirement = loadRequirement(userId, requirementPk);
        ArtifactSyncEntity sync = new ArtifactSyncEntity();
        sync.setRequirementPk(requirement.getId());
        sync.setStage(normalizeStage(request.getStage()));
        sync.setSyncType(normalizeSyncType(request.getSyncType()));
        sync.setStatus("BLOCKED");
        sync.setFileCount(0);
        sync.setPushedBy(userId);
        sync.setErrorMessage(request.getErrorMessage());
        artifactSyncMapper.insert(sync);
        publishBlockedEvent(requirement, sync);
        return toSyncVO(sync);
    }

    @Transactional(rollbackFor = Exception.class)
    public ArtifactGitSyncCompleteVO complete(Long userId, Long requirementPk, ArtifactGitSyncCompleteRequest request) {
        RequirementEntity requirement = loadRequirement(userId, requirementPk);
        ArtifactSyncEntity sync = createSync(requirement, userId, request);
        ArtifactGitSyncCompleteVO vo = new ArtifactGitSyncCompleteVO();
        vo.setSync(toSyncVO(sync));
        vo.setVersions(request.getFiles().stream()
            .map(file -> toVersionVO(saveVersion(requirement, userId, request, file)))
            .collect(Collectors.toList()));
        publishCompletedEvent(requirement, sync);
        return vo;
    }

    @Transactional(rollbackFor = Exception.class)
    public ArtifactGitSyncCompleteVO completeAndReview(Long userId, Long requirementPk, ArtifactGitSyncCompleteRequest request) {
        if (requirementPk == null) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "缺少需求主键");
        }
        if (request.getReview() == null) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "缺少审核结论");
        }
        ArtifactGitSyncCompleteVO vo = complete(userId, requirementPk, request);
        ArtifactGitSyncReviewRequest review = request.getReview();
        StageReviewRequest reviewRequest = new StageReviewRequest();
        reviewRequest.setRequirementPk(requirementPk);
        reviewRequest.setStage(request.getStage());
        reviewRequest.setImplementationStep(review.getImplementationStep());
        reviewRequest.setDecision(review.getDecision());
        reviewRequest.setComment(review.getComment());
        if (!vo.getVersions().isEmpty()) {
            reviewRequest.setArtifactVersionId(vo.getVersions().get(0).getId());
        }
        reviewService.review(userId, reviewRequest);
        return vo;
    }

    private RequirementEntity loadRequirement(Long userId, Long requirementPk) {
        RequirementEntity requirement = requirementMapper.selectById(requirementPk);
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        return requirement;
    }

    private ArtifactSyncEntity createSync(RequirementEntity requirement, Long userId, ArtifactGitSyncCompleteRequest request) {
        ArtifactSyncEntity sync = new ArtifactSyncEntity();
        sync.setRequirementPk(requirement.getId());
        sync.setStage(normalizeStage(request.getStage()));
        sync.setSyncType(normalizeSyncType(request.getSyncType()));
        sync.setStatus("PUSHED");
        sync.setCommitSha(normalizeCommitSha(request.getCommitSha()));
        sync.setFileCount(request.getFiles().size());
        sync.setPushedBy(userId);
        sync.setPushedAt(LocalDateTime.now());
        artifactSyncMapper.insert(sync);
        return sync;
    }

    private ArtifactGitVersionEntity saveVersion(
        RequirementEntity requirement,
        Long userId,
        ArtifactGitSyncCompleteRequest request,
        ArtifactGitSyncFileRequest file
    ) {
        String filePath = normalizeControlledPath(requirement, file.getPath());
        ArtifactEntity artifact = findOrCreateArtifact(requirement, request.getStage(), filePath);
        ArtifactGitVersionEntity version = new ArtifactGitVersionEntity();
        version.setArtifactId(artifact.getId());
        version.setVersionNo(nextGitVersionNo(artifact.getId()));
        version.setCommitSha(normalizeCommitSha(request.getCommitSha()));
        version.setBlobSha(normalizeRequired(file.getBlobSha(), "Git blob不能为空"));
        version.setContentSha256(normalizeRequired(file.getContentSha256(), "文件hash不能为空"));
        version.setFilePath(filePath);
        version.setBaseCommitSha(blankToNull(request.getBaseCommitSha()));
        version.setStatus("CURRENT");
        version.setSourceRunId(request.getSourceRunId());
        version.setCreatedBy(userId);
        artifactGitVersionMapper.insert(version);

        artifact.setCurrentVersionId(version.getId());
        artifactMapper.updateById(artifact);
        return version;
    }

    private ArtifactEntity findOrCreateArtifact(RequirementEntity requirement, String stage, String filePath) {
        ArtifactEntity artifact = artifactMapper.selectOne(new LambdaQueryWrapper<ArtifactEntity>()
            .eq(ArtifactEntity::getRequirementPk, requirement.getId())
            .eq(ArtifactEntity::getLogicalPath, filePath)
            .last("LIMIT 1"));
        if (artifact != null) {
            return artifact;
        }
        artifact = new ArtifactEntity();
        artifact.setRequirementPk(requirement.getId());
        artifact.setLogicalPath(filePath);
        artifact.setLabel(labelForPath(filePath));
        artifact.setKind(kindForPath(filePath));
        artifact.setStage(normalizeStage(stage));
        artifact.setVersion(0L);
        artifactMapper.insert(artifact);
        return artifact;
    }

    private int nextGitVersionNo(Long artifactId) {
        return artifactGitVersionMapper.selectList(new LambdaQueryWrapper<ArtifactGitVersionEntity>()
                .eq(ArtifactGitVersionEntity::getArtifactId, artifactId))
            .stream()
            .map(ArtifactGitVersionEntity::getVersionNo)
            .filter(item -> item != null)
            .max(Integer::compareTo)
            .orElse(0) + 1;
    }

    private String normalizeControlledPath(RequirementEntity requirement, String path) {
        String value = normalizeRequired(path, "同步文件路径不能为空").replace("\\", "/");
        String requirementPrefix = "docs/" + requirement.getRequirementId() + "/";
        boolean allowed = value.startsWith(requirementPrefix)
            || value.startsWith("docs/code_review/")
            || value.startsWith("openspec/changes/")
            || value.startsWith("openspec/specs/")
            || AGENT_SKILL_PREFIXES.stream().anyMatch(value::startsWith);
        if (!allowed || value.contains("../") || value.startsWith("/") || value.contains("//")) {
            throw new BusinessException(AiDeliveryErrorCode.ARTIFACT_SYNC_PATH_DENIED, "同步文件不在受控产物路径内: " + value);
        }
        return value;
    }

    private String normalizeStage(String stage) {
        return normalizeRequired(stage, "阶段不能为空").toUpperCase(Locale.ROOT);
    }

    private String normalizeSyncType(String syncType) {
        return normalizeRequired(syncType, "同步类型不能为空").toUpperCase(Locale.ROOT);
    }

    private String normalizeCommitSha(String commitSha) {
        String value = normalizeRequired(commitSha, "Git commit不能为空");
        if (!value.matches("^[a-fA-F0-9]{7,40}$")) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "Git commit格式非法");
        }
        return value;
    }

    private String normalizeRequired(String value, String message) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, message);
        }
        return normalized;
    }

    private String blankToNull(String value) {
        String normalized = value == null ? "" : value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String labelForPath(String filePath) {
        int index = filePath.lastIndexOf('/');
        return index >= 0 ? filePath.substring(index + 1) : filePath;
    }

    private String kindForPath(String filePath) {
        if (filePath.contains("/prd/")) {
            return "PRD";
        }
        if (filePath.contains("/technical-design/")) {
            return "TECH_DESIGN";
        }
        if (filePath.contains("/code-review/") || filePath.contains("/code_review/")) {
            return "CODE_REVIEW";
        }
        if (filePath.startsWith("openspec/")) {
            return "OPENSPEC";
        }
        return "ARTIFACT";
    }

    private void publishCompletedEvent(RequirementEntity requirement, ArtifactSyncEntity sync) {
        domainEventService.publishAfterCommit(
            requirement.getProjectId(),
            "artifact.git-sync.completed",
            "REQUIREMENT",
            requirement.getId(),
            "{\"requirementPk\":" + requirement.getId()
                + ",\"syncId\":" + sync.getId()
                + ",\"stage\":\"" + sync.getStage()
                + "\",\"commitSha\":\"" + sync.getCommitSha() + "\"}"
        );
        publishPullRequiredEvent(requirement, sync);
    }

    private void publishPullRequiredEvent(RequirementEntity requirement, ArtifactSyncEntity sync) {
        String commitSha = sync.getCommitSha();
        if (commitSha == null || commitSha.trim().isEmpty()) {
            return;
        }
        java.util.List<UserProjectRepoStateEntity> states = userProjectRepoStateMapper.selectList(new LambdaQueryWrapper<UserProjectRepoStateEntity>()
            .eq(UserProjectRepoStateEntity::getProjectId, requirement.getProjectId()));
        String targetUserIds = (states == null ? Collections.<UserProjectRepoStateEntity>emptyList() : states).stream()
            .filter(item -> sync.getPushedBy() == null || !sync.getPushedBy().equals(item.getUserId()))
            .filter(item -> item.getHeadCommit() == null || !commitSha.equalsIgnoreCase(item.getHeadCommit()))
            .map(item -> String.valueOf(item.getUserId()))
            .distinct()
            .collect(Collectors.joining(","));
        if (targetUserIds.isEmpty()) {
            return;
        }
        domainEventService.publishAfterCommit(
            requirement.getProjectId(),
            "project.repo.pull-required",
            "PROJECT",
            requirement.getProjectId(),
            "{\"requirementPk\":" + requirement.getId()
                + ",\"commitSha\":\"" + commitSha
                + "\",\"targetUserIds\":[" + targetUserIds + "]}"
        );
    }

    private void publishBlockedEvent(RequirementEntity requirement, ArtifactSyncEntity sync) {
        domainEventService.publishAfterCommit(
            requirement.getProjectId(),
            "artifact.git-sync.blocked",
            "REQUIREMENT",
            requirement.getId(),
            "{\"requirementPk\":" + requirement.getId()
                + ",\"syncId\":" + sync.getId()
                + ",\"stage\":\"" + sync.getStage()
                + "\",\"syncType\":\"" + sync.getSyncType()
                + "\",\"errorMessage\":\"" + escapeJson(sync.getErrorMessage()) + "\"}"
        );
    }

    private String escapeJson(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private ArtifactSyncVO toSyncVO(ArtifactSyncEntity entity) {
        ArtifactSyncVO vo = new ArtifactSyncVO();
        vo.setId(entity.getId());
        vo.setRequirementPk(entity.getRequirementPk());
        vo.setStage(entity.getStage());
        vo.setSyncType(entity.getSyncType());
        vo.setStatus(entity.getStatus());
        vo.setCommitSha(entity.getCommitSha());
        vo.setFileCount(entity.getFileCount());
        vo.setPushedBy(entity.getPushedBy());
        vo.setPushedAt(entity.getPushedAt());
        vo.setErrorMessage(entity.getErrorMessage());
        return vo;
    }

    private ArtifactGitVersionVO toVersionVO(ArtifactGitVersionEntity entity) {
        ArtifactGitVersionVO vo = new ArtifactGitVersionVO();
        vo.setId(entity.getId());
        vo.setArtifactId(entity.getArtifactId());
        vo.setVersionNo(entity.getVersionNo());
        vo.setCommitSha(entity.getCommitSha());
        vo.setBlobSha(entity.getBlobSha());
        vo.setContentSha256(entity.getContentSha256());
        vo.setFilePath(entity.getFilePath());
        vo.setBaseCommitSha(entity.getBaseCommitSha());
        vo.setStatus(entity.getStatus());
        vo.setSourceRunId(entity.getSourceRunId());
        vo.setCreatedBy(entity.getCreatedBy());
        vo.setCreatedAt(entity.getCreatedAt());
        return vo;
    }
}
