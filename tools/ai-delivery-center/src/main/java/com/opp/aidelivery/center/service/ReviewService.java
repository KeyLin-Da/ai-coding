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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class ReviewService {

    private static final List<String> STAGES = Arrays.asList("PRD", "TECH_DESIGN", "IMPLEMENTATION", "CODE_REVIEW", "RETROSPECTIVE");
    private static final List<String> IMPLEMENTATION_STEPS = Arrays.asList("START_CHANGE", "ARTIFACT_REVIEW", "APPLY", "CHANGE_INSPECTION");

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
        if (!STAGES.contains(request.getStage())) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "阶段不存在");
        }
        WorkflowStageEntity stage = findStage(requirement.getId(), request.getStage());
        if (stage == null) {
            stage = createStage(requirement, request.getStage(), "DRAFT");
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
        if ("IMPLEMENTATION".equals(request.getStage()) && StringUtils.hasText(request.getImplementationStep())) {
            applyImplementationStepDecision(requirement, stage, request, now);
            workflowStageMapper.updateById(stage);
            requirementMapper.updateById(requirement);
            return;
        }
        if ("IMPLEMENTATION".equals(request.getStage()) && isPositiveDecision(request.getDecision())) {
            assertAllImplementationStepsApproved(requirement.getId());
        }
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

    private void applyImplementationStepDecision(
        RequirementEntity requirement,
        WorkflowStageEntity stage,
        StageReviewRequest request,
        LocalDateTime now
    ) {
        if (!IMPLEMENTATION_STEPS.contains(request.getImplementationStep())) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "实施步骤不存在");
        }
        if ("APPROVED".equals(request.getDecision())) {
            stage.setStatus("IN_PROGRESS");
            requirement.setStatus("IN_PROGRESS");
            requirement.setCurrentStage("IMPLEMENTATION");
            return;
        }
        if ("REJECTED".equals(request.getDecision())) {
            stage.setStatus("REJECTED");
            stage.setRejectedAt(now);
            requirement.setStatus("REJECTED");
            requirement.setCurrentStage("IMPLEMENTATION");
            return;
        }
        stage.setStatus("IN_REVIEW");
        requirement.setStatus("IN_PROGRESS");
        requirement.setCurrentStage("IMPLEMENTATION");
    }

    private boolean isPositiveDecision(String decision) {
        return "APPROVED".equals(decision) || "RISK_ACCEPTED".equals(decision);
    }

    private void assertAllImplementationStepsApproved(Long requirementPk) {
        List<ReviewEntity> reviews = reviewMapper.selectList(new LambdaQueryWrapper<ReviewEntity>()
            .eq(ReviewEntity::getRequirementPk, requirementPk)
            .eq(ReviewEntity::getStage, "IMPLEMENTATION")
            .in(ReviewEntity::getImplementationStep, IMPLEMENTATION_STEPS)
            .orderByDesc(ReviewEntity::getCreatedAt)
            .orderByDesc(ReviewEntity::getId));
        Map<String, String> latestDecisionByStep = new HashMap<>();
        for (ReviewEntity review : reviews) {
            latestDecisionByStep.putIfAbsent(review.getImplementationStep(), review.getDecision());
        }
        boolean allApproved = IMPLEMENTATION_STEPS.stream()
            .allMatch(step -> "APPROVED".equals(latestDecisionByStep.get(step)));
        if (!allApproved) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "实施验证子步骤未全部通过，无法审核实施验证");
        }
    }

    private void advanceRequirement(RequirementEntity requirement, String currentStage) {
        int index = STAGES.indexOf(currentStage);
        String next = index >= 0 && index + 1 < STAGES.size() ? STAGES.get(index + 1) : "DONE";
        requirement.setCurrentStage(next);
        requirement.setStatus("DONE".equals(next) ? "DONE" : "IN_PROGRESS");
        if (!"DONE".equals(next)) {
            WorkflowStageEntity nextStage = findStage(requirement.getId(), next);
            if (nextStage == null) {
                createStage(requirement, next, "DRAFT");
            } else if ("NOT_STARTED".equals(nextStage.getStatus())) {
                nextStage.setStatus("DRAFT");
                workflowStageMapper.updateById(nextStage);
            }
        }
    }

    private WorkflowStageEntity findStage(Long requirementPk, String stageName) {
        return workflowStageMapper.selectOne(new LambdaQueryWrapper<WorkflowStageEntity>()
            .eq(WorkflowStageEntity::getRequirementPk, requirementPk)
            .eq(WorkflowStageEntity::getStage, stageName)
            .last("LIMIT 1"));
    }

    private WorkflowStageEntity createStage(RequirementEntity requirement, String stageName, String status) {
        WorkflowStageEntity stage = new WorkflowStageEntity();
        stage.setRequirementPk(requirement.getId());
        stage.setStage(stageName);
        stage.setStatus(status);
        stage.setVersion(0L);
        workflowStageMapper.insert(stage);
        return stage;
    }
}
