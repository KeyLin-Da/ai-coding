package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.ReviewMapper;
import com.opp.aidelivery.center.mapper.WorkflowStageMapper;
import com.opp.aidelivery.center.model.dto.StageReviewRequest;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.ReviewEntity;
import com.opp.aidelivery.center.model.entity.WorkflowStageEntity;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ReviewService {

    private static final List<String> STAGES = Arrays.asList("PRD", "TECH_DESIGN", "IMPLEMENTATION", "CODE_REVIEW");

    private final PermissionService permissionService;
    private final RequirementMapper requirementMapper;
    private final WorkflowStageMapper workflowStageMapper;
    private final ReviewMapper reviewMapper;
    private final DomainEventService domainEventService;

    @Transactional(rollbackFor = Exception.class)
    public ReviewEntity review(Long userId, StageReviewRequest request) {
        RequirementEntity requirement = requirementMapper.selectById(request.getRequirementPk());
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        WorkflowStageEntity stage = workflowStageMapper.selectOne(new LambdaQueryWrapper<WorkflowStageEntity>()
            .eq(WorkflowStageEntity::getRequirementPk, requirement.getId())
            .eq(WorkflowStageEntity::getStage, request.getStage())
            .last("LIMIT 1"));
        if (stage == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "阶段不存在");
        }

        ReviewEntity review = new ReviewEntity();
        review.setRequirementPk(requirement.getId());
        review.setStage(request.getStage());
        review.setImplementationStep(request.getImplementationStep());
        review.setDecision(request.getDecision());
        review.setComment(request.getComment());
        review.setActorId(userId);
        review.setArtifactVersionId(request.getArtifactVersionId());
        reviewMapper.insert(review);

        applyStageDecision(requirement, stage, request);
        domainEventService.publishAfterCommit(
            requirement.getProjectId(),
            "workflow.stage.reviewed",
            "REQUIREMENT",
            requirement.getId(),
            "{\"requirementPk\":" + requirement.getId()
                + ",\"stage\":\"" + request.getStage()
                + "\",\"decision\":\"" + request.getDecision()
                + "\",\"reviewId\":" + review.getId() + "}"
        );
        return review;
    }

    private void applyStageDecision(RequirementEntity requirement, WorkflowStageEntity stage, StageReviewRequest request) {
        LocalDateTime now = LocalDateTime.now();
        stage.setComment(request.getComment());
        if ("APPROVED".equals(request.getDecision())) {
            stage.setStatus("APPROVED");
            stage.setApprovedAt(now);
            advanceRequirement(requirement, stage.getStage());
        } else if ("REJECTED".equals(request.getDecision())) {
            stage.setStatus("REJECTED");
            stage.setRejectedAt(now);
            requirement.setStatus("REJECTED");
            requirement.setCurrentStage(stage.getStage());
        } else {
            stage.setStatus("APPROVED");
            stage.setApprovedAt(now);
            advanceRequirement(requirement, stage.getStage());
        }
        workflowStageMapper.updateById(stage);
        requirementMapper.updateById(requirement);
    }

    private void advanceRequirement(RequirementEntity requirement, String currentStage) {
        int index = STAGES.indexOf(currentStage);
        String next = index >= 0 && index + 1 < STAGES.size() ? STAGES.get(index + 1) : "DONE";
        requirement.setCurrentStage(next);
        requirement.setStatus("DONE".equals(next) ? "DONE" : "IN_PROGRESS");
        if (!"DONE".equals(next)) {
            WorkflowStageEntity nextStage = workflowStageMapper.selectOne(new LambdaQueryWrapper<WorkflowStageEntity>()
                .eq(WorkflowStageEntity::getRequirementPk, requirement.getId())
                .eq(WorkflowStageEntity::getStage, next)
                .last("LIMIT 1"));
            if (nextStage != null && "NOT_STARTED".equals(nextStage.getStatus())) {
                nextStage.setStatus("DRAFT");
                workflowStageMapper.updateById(nextStage);
            }
        }
    }
}
