package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.RequirementProjectMapper;
import com.opp.aidelivery.center.mapper.ReviewMapper;
import com.opp.aidelivery.center.mapper.WorkflowStageMapper;
import com.opp.aidelivery.center.model.dto.RequirementCreateRequest;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.RequirementProjectEntity;
import com.opp.aidelivery.center.model.entity.ReviewEntity;
import com.opp.aidelivery.center.model.entity.WorkflowStageEntity;
import com.opp.aidelivery.center.model.vo.RequirementVO;
import com.opp.aidelivery.center.model.vo.ReviewVO;
import com.opp.aidelivery.center.model.vo.WorkflowStageVO;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class RequirementService {

    private static final List<String> STAGES = Arrays.asList("PRD", "TECH_DESIGN", "IMPLEMENTATION", "CODE_REVIEW", "RETROSPECTIVE");

    private final PermissionService permissionService;
    private final RequirementMapper requirementMapper;
    private final RequirementProjectMapper requirementProjectMapper;
    private final WorkflowStageMapper workflowStageMapper;
    private final ReviewMapper reviewMapper;

    @Transactional(rollbackFor = Exception.class)
    public RequirementVO create(Long userId, RequirementCreateRequest request) {
        permissionService.assertProjectMember(userId, request.getProjectId());

        RequirementEntity existing = requirementMapper.selectOne(new LambdaQueryWrapper<RequirementEntity>()
            .eq(RequirementEntity::getProjectId, request.getProjectId())
            .eq(RequirementEntity::getRequirementId, request.getRequirementId())
            .last("LIMIT 1"));

        if (existing != null) {
            existing.setTitle(request.getTitle());
            existing.setBranchName(defaultBranchName(request));
            requirementMapper.updateById(existing);
            replaceProjects(existing.getId(), request.getProjectNames());
            ensureWorkflowStages(existing);
            return get(userId, request.getProjectId(), request.getRequirementId());
        }

        RequirementEntity requirement = new RequirementEntity();
        requirement.setProjectId(request.getProjectId());
        requirement.setRequirementId(request.getRequirementId());
        requirement.setTitle(request.getTitle());
        requirement.setRequirementType(normalizeRequirementType(request.getRequirementType()));
        requirement.setBranchName(defaultBranchName(request));
        requirement.setStatus("DRAFT");
        requirement.setCurrentStage("DEFECT".equals(requirement.getRequirementType()) ? "TECH_DESIGN" : "PRD");
        requirement.setVersion(0L);
        requirement.setCreatedBy(userId);
        requirementMapper.insert(requirement);

        saveProjects(requirement.getId(), request.getProjectNames());

        for (String stage : STAGES) {
            WorkflowStageEntity entity = new WorkflowStageEntity();
            entity.setRequirementPk(requirement.getId());
            entity.setStage(stage);
            entity.setStatus(initialStageStatus(requirement.getRequirementType(), stage));
            entity.setVersion(0L);
            workflowStageMapper.insert(entity);
        }
        return get(userId, request.getProjectId(), request.getRequirementId());
    }

    public List<RequirementVO> list(Long userId, Long projectId) {
        permissionService.assertProjectMember(userId, projectId);
        List<RequirementEntity> requirements = requirementMapper.selectList(new LambdaQueryWrapper<RequirementEntity>()
            .eq(RequirementEntity::getProjectId, projectId)
            .orderByDesc(RequirementEntity::getUpdatedAt));
        return requirements.stream().map(this::toVOWithStagesAndProjects).collect(Collectors.toList());
    }

    public RequirementVO get(Long userId, Long projectId, String requirementId) {
        permissionService.assertProjectMember(userId, projectId);
        RequirementEntity requirement = requirementMapper.selectOne(new LambdaQueryWrapper<RequirementEntity>()
            .eq(RequirementEntity::getProjectId, projectId)
            .eq(RequirementEntity::getRequirementId, requirementId)
            .last("LIMIT 1"));
        if (requirement == null) {
            return null;
        }
        return toVOWithStagesAndProjects(requirement);
    }

    private void saveProjects(Long requirementPk, List<String> projectNames) {
        if (projectNames == null || projectNames.isEmpty()) {
            return;
        }
        for (String name : projectNames) {
            if (name == null || name.trim().isEmpty()) {
                continue;
            }
            RequirementProjectEntity entity = new RequirementProjectEntity();
            entity.setRequirementPk(requirementPk);
            entity.setProjectName(name.trim());
            requirementProjectMapper.insert(entity);
        }
    }

    private void replaceProjects(Long requirementPk, List<String> projectNames) {
        requirementProjectMapper.delete(new LambdaQueryWrapper<RequirementProjectEntity>()
            .eq(RequirementProjectEntity::getRequirementPk, requirementPk));
        saveProjects(requirementPk, projectNames);
    }

    private List<String> loadProjectNames(Long requirementPk) {
        List<RequirementProjectEntity> entities = requirementProjectMapper.selectList(
            new LambdaQueryWrapper<RequirementProjectEntity>()
                .eq(RequirementProjectEntity::getRequirementPk, requirementPk));
        return entities.stream().map(RequirementProjectEntity::getProjectName).collect(Collectors.toList());
    }

    private RequirementVO toVOWithStagesAndProjects(RequirementEntity requirement) {
        RequirementVO vo = toVOWithStages(requirement);
        vo.setProjectNames(loadProjectNames(requirement.getId()));
        vo.setReviews(loadReviews(requirement.getId()));
        return vo;
    }

    private RequirementVO toVOWithStages(RequirementEntity requirement) {
        RequirementVO vo = toVO(requirement);
        List<WorkflowStageEntity> stages = workflowStageMapper.selectList(new LambdaQueryWrapper<WorkflowStageEntity>()
            .eq(WorkflowStageEntity::getRequirementPk, requirement.getId()));
        Map<String, WorkflowStageEntity> byStage = stages.stream().collect(Collectors.toMap(WorkflowStageEntity::getStage, item -> item));
        vo.setStages(STAGES.stream()
            .filter(byStage::containsKey)
            .map(item -> toStageVO(byStage.get(item)))
            .collect(Collectors.toList()));
        return vo;
    }

    private RequirementVO toVO(RequirementEntity entity) {
        RequirementVO vo = new RequirementVO();
        vo.setId(entity.getId());
        vo.setProjectId(entity.getProjectId());
        vo.setRequirementId(entity.getRequirementId());
        vo.setTitle(entity.getTitle());
        vo.setRequirementType(entity.getRequirementType());
        vo.setBranchName(entity.getBranchName());
        vo.setStatus(entity.getStatus());
        vo.setCurrentStage(entity.getCurrentStage());
        vo.setVersion(entity.getVersion());
        return vo;
    }

    private WorkflowStageVO toStageVO(WorkflowStageEntity entity) {
        WorkflowStageVO vo = new WorkflowStageVO();
        vo.setId(entity.getId());
        vo.setStage(entity.getStage());
        vo.setStatus(entity.getStatus());
        vo.setArtifactId(entity.getArtifactId());
        vo.setApprovedAt(entity.getApprovedAt());
        vo.setRejectedAt(entity.getRejectedAt());
        vo.setComment(entity.getComment());
        vo.setVersion(entity.getVersion());
        return vo;
    }

    private List<ReviewVO> loadReviews(Long requirementPk) {
        List<ReviewEntity> reviews = reviewMapper.selectList(new LambdaQueryWrapper<ReviewEntity>()
            .eq(ReviewEntity::getRequirementPk, requirementPk)
            .orderByDesc(ReviewEntity::getCreatedAt)
            .orderByDesc(ReviewEntity::getId));
        return reviews.stream().map(this::toReviewVO).collect(Collectors.toList());
    }

    private ReviewVO toReviewVO(ReviewEntity entity) {
        ReviewVO vo = new ReviewVO();
        vo.setId(entity.getId());
        vo.setRequirementPk(entity.getRequirementPk());
        vo.setStage(entity.getStage());
        vo.setImplementationStep(entity.getImplementationStep());
        vo.setDecision(entity.getDecision());
        vo.setComment(entity.getComment());
        vo.setActorId(entity.getActorId());
        vo.setArtifactVersionId(entity.getArtifactVersionId());
        vo.setCreatedAt(entity.getCreatedAt());
        return vo;
    }

    private String normalizeRequirementType(String type) {
        return "DEFECT".equals(type) ? "DEFECT" : "REQUIREMENT";
    }

    private String defaultBranchName(RequirementCreateRequest request) {
        if (request.getBranchName() != null && !request.getBranchName().trim().isEmpty()) {
            return request.getBranchName().trim();
        }
        String prefix = "DEFECT".equals(normalizeRequirementType(request.getRequirementType())) ? "bugfix" : "feature";
        return prefix + "/opp#" + request.getRequirementId();
    }

    private String initialStageStatus(String requirementType, String stage) {
        if ("DEFECT".equals(requirementType)) {
            if ("PRD".equals(stage)) {
                return "SKIPPED";
            }
            return "TECH_DESIGN".equals(stage) ? "DRAFT" : "NOT_STARTED";
        }
        return "PRD".equals(stage) ? "DRAFT" : "NOT_STARTED";
    }

    private void ensureWorkflowStages(RequirementEntity requirement) {
        for (String stage : STAGES) {
            WorkflowStageEntity existing = workflowStageMapper.selectOne(new LambdaQueryWrapper<WorkflowStageEntity>()
                .eq(WorkflowStageEntity::getRequirementPk, requirement.getId())
                .eq(WorkflowStageEntity::getStage, stage)
                .last("LIMIT 1"));
            if (existing != null) {
                continue;
            }
            WorkflowStageEntity entity = new WorkflowStageEntity();
            entity.setRequirementPk(requirement.getId());
            entity.setStage(stage);
            entity.setStatus(missingStageStatus(requirement, stage));
            entity.setVersion(0L);
            workflowStageMapper.insert(entity);
        }
    }

    private String missingStageStatus(RequirementEntity requirement, String stage) {
        if ("RETROSPECTIVE".equals(stage) && ("DONE".equals(requirement.getCurrentStage()) || "DONE".equals(requirement.getStatus()))) {
            return "SKIPPED";
        }
        return initialStageStatus(requirement.getRequirementType(), stage);
    }
}
