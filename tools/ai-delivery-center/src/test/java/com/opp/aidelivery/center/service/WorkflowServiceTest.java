package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.IssueMapper;
import com.opp.aidelivery.center.mapper.ProjectMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.RequirementProjectMapper;
import com.opp.aidelivery.center.mapper.ReviewMapper;
import com.opp.aidelivery.center.mapper.TeamMemberMapper;
import com.opp.aidelivery.center.mapper.WorkflowStageMapper;
import com.opp.aidelivery.center.model.dto.IssueCreateRequest;
import com.opp.aidelivery.center.model.dto.IssueStatusUpdateRequest;
import com.opp.aidelivery.center.model.dto.StageReviewRequest;
import com.opp.aidelivery.center.model.entity.IssueEntity;
import com.opp.aidelivery.center.model.entity.ProjectEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.ReviewEntity;
import com.opp.aidelivery.center.model.entity.TeamMemberEntity;
import com.opp.aidelivery.center.model.entity.WorkflowStageEntity;
import com.opp.aidelivery.center.model.vo.RequirementVO;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class WorkflowServiceTest {

    @Mock
    private ProjectMapper projectMapper;
    @Mock
    private TeamMemberMapper teamMemberMapper;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private RequirementProjectMapper requirementProjectMapper;
    @Mock
    private WorkflowStageMapper workflowStageMapper;
    @Mock
    private ReviewMapper reviewMapper;
    @Mock
    private IssueMapper issueMapper;
    @Mock
    private DomainEventService domainEventService;

    @Test
    void permissionServiceAllowsTeamMember() {
        PermissionService service = new PermissionService(projectMapper, teamMemberMapper);
        ProjectEntity project = new ProjectEntity();
        project.setId(10L);
        project.setTeamId(20L);
        when(projectMapper.selectById(10L)).thenReturn(project);
        when(teamMemberMapper.selectOne(any())).thenReturn(new TeamMemberEntity());

        ProjectEntity result = service.assertProjectMember(1L, 10L);

        assertThat(result).isSameAs(project);
    }

    @Test
    void permissionServiceRejectsNonMember() {
        PermissionService service = new PermissionService(projectMapper, teamMemberMapper);
        ProjectEntity project = new ProjectEntity();
        project.setId(10L);
        project.setTeamId(20L);
        when(projectMapper.selectById(10L)).thenReturn(project);
        when(teamMemberMapper.selectOne(any())).thenReturn(null);

        assertThatThrownBy(() -> service.assertProjectMember(1L, 10L))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.ACCESS_DENIED);
    }

    @Test
    void reviewApprovalAdvancesWorkflowAndDraftsNextStage() {
        PermissionService permissionService = org.mockito.Mockito.mock(PermissionService.class);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        ReviewService service = new ReviewService(permissionService, requirementMapper, workflowStageMapper, reviewMapper, domainEventService);
        RequirementEntity requirement = requirement();
        WorkflowStageEntity prdStage = stage("PRD", "READY_FOR_REVIEW");
        WorkflowStageEntity designStage = stage("TECH_DESIGN", "NOT_STARTED");
        when(requirementMapper.selectById(100L)).thenReturn(requirement);
        when(workflowStageMapper.selectOne(any())).thenReturn(prdStage, designStage);

        StageReviewRequest request = new StageReviewRequest();
        request.setRequirementPk(100L);
        request.setStage("PRD");
        request.setDecision("APPROVED");
        service.review(1L, request);

        assertThat(prdStage.getStatus()).isEqualTo("APPROVED");
        assertThat(designStage.getStatus()).isEqualTo("DRAFT");
        assertThat(requirement.getCurrentStage()).isEqualTo("TECH_DESIGN");
        assertThat(requirement.getStatus()).isEqualTo("IN_PROGRESS");
        verify(reviewMapper).insert(any());
        verify(requirementMapper).updateById(requirement);
    }

    @Test
    void reviewRejectionReturnsWorkflowToRejectedStage() {
        PermissionService permissionService = org.mockito.Mockito.mock(PermissionService.class);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        ReviewService service = new ReviewService(permissionService, requirementMapper, workflowStageMapper, reviewMapper, domainEventService);
        RequirementEntity requirement = requirement();
        WorkflowStageEntity stage = stage("TECH_DESIGN", "READY_FOR_REVIEW");
        when(requirementMapper.selectById(100L)).thenReturn(requirement);
        when(workflowStageMapper.selectOne(any())).thenReturn(stage);

        StageReviewRequest request = new StageReviewRequest();
        request.setRequirementPk(100L);
        request.setStage("TECH_DESIGN");
        request.setDecision("REJECTED");
        request.setComment("补充缓存策略");
        service.review(1L, request);

        assertThat(stage.getStatus()).isEqualTo("REJECTED");
        assertThat(requirement.getCurrentStage()).isEqualTo("TECH_DESIGN");
        assertThat(requirement.getStatus()).isEqualTo("REJECTED");
        verify(workflowStageMapper).updateById(stage);
    }

    @Test
    void reviewImplementationStepApprovalKeepsImplementationStageInProgress() {
        PermissionService permissionService = org.mockito.Mockito.mock(PermissionService.class);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        ReviewService service = new ReviewService(permissionService, requirementMapper, workflowStageMapper, reviewMapper, domainEventService);
        RequirementEntity requirement = requirement();
        requirement.setCurrentStage("IMPLEMENTATION");
        WorkflowStageEntity implementationStage = stage("IMPLEMENTATION", "READY_FOR_REVIEW");
        when(requirementMapper.selectById(100L)).thenReturn(requirement);
        when(workflowStageMapper.selectOne(any())).thenReturn(implementationStage);

        StageReviewRequest request = new StageReviewRequest();
        request.setRequirementPk(100L);
        request.setStage("IMPLEMENTATION");
        request.setImplementationStep("START_CHANGE");
        request.setDecision("APPROVED");
        service.review(1L, request);

        assertThat(implementationStage.getStatus()).isEqualTo("IN_PROGRESS");
        assertThat(requirement.getCurrentStage()).isEqualTo("IMPLEMENTATION");
        assertThat(requirement.getStatus()).isEqualTo("IN_PROGRESS");
        ArgumentCaptor<ReviewEntity> captor = ArgumentCaptor.forClass(ReviewEntity.class);
        verify(reviewMapper).insert(captor.capture());
        assertThat(captor.getValue().getImplementationStep()).isEqualTo("START_CHANGE");
    }

    @Test
    void reviewFinalImplementationStepApprovalKeepsTopImplementationStageInProgress() {
        PermissionService permissionService = org.mockito.Mockito.mock(PermissionService.class);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        ReviewService service = new ReviewService(permissionService, requirementMapper, workflowStageMapper, reviewMapper, domainEventService);
        RequirementEntity requirement = requirement();
        requirement.setCurrentStage("IMPLEMENTATION");
        WorkflowStageEntity implementationStage = stage("IMPLEMENTATION", "READY_FOR_REVIEW");
        when(requirementMapper.selectById(100L)).thenReturn(requirement);
        when(workflowStageMapper.selectOne(any())).thenReturn(implementationStage);

        StageReviewRequest request = new StageReviewRequest();
        request.setRequirementPk(100L);
        request.setStage("IMPLEMENTATION");
        request.setImplementationStep("CHANGE_INSPECTION");
        request.setDecision("APPROVED");
        service.review(1L, request);

        // 最后一个子步骤通过只是确认内部进度，顶层实施验证仍需单独审核。
        assertThat(implementationStage.getStatus()).isEqualTo("IN_PROGRESS");
        assertThat(requirement.getCurrentStage()).isEqualTo("IMPLEMENTATION");
        assertThat(requirement.getStatus()).isEqualTo("IN_PROGRESS");
    }

    @Test
    void reviewImplementationStageApprovalAfterAllStepsAdvancesToCodeReview() {
        PermissionService permissionService = org.mockito.Mockito.mock(PermissionService.class);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        ReviewService service = new ReviewService(permissionService, requirementMapper, workflowStageMapper, reviewMapper, domainEventService);
        RequirementEntity requirement = requirement();
        requirement.setCurrentStage("IMPLEMENTATION");
        WorkflowStageEntity implementationStage = stage("IMPLEMENTATION", "READY_FOR_REVIEW");
        WorkflowStageEntity codeReviewStage = stage("CODE_REVIEW", "NOT_STARTED");
        when(requirementMapper.selectById(100L)).thenReturn(requirement);
        when(workflowStageMapper.selectOne(any())).thenReturn(implementationStage, codeReviewStage);
        when(reviewMapper.selectList(any())).thenReturn(approvedImplementationStepReviews());

        StageReviewRequest request = new StageReviewRequest();
        request.setRequirementPk(100L);
        request.setStage("IMPLEMENTATION");
        request.setDecision("APPROVED");
        service.review(1L, request);

        // 四个子步骤全部通过后，顶层实施验证审核通过才推进到代码评审。
        assertThat(implementationStage.getStatus()).isEqualTo("APPROVED");
        assertThat(codeReviewStage.getStatus()).isEqualTo("DRAFT");
        assertThat(requirement.getCurrentStage()).isEqualTo("CODE_REVIEW");
        assertThat(requirement.getStatus()).isEqualTo("IN_PROGRESS");
    }

    @Test
    void reviewImplementationStageApprovalRejectsWhenAnyStepMissing() {
        PermissionService permissionService = org.mockito.Mockito.mock(PermissionService.class);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        ReviewService service = new ReviewService(permissionService, requirementMapper, workflowStageMapper, reviewMapper, domainEventService);
        RequirementEntity requirement = requirement();
        requirement.setCurrentStage("IMPLEMENTATION");
        WorkflowStageEntity implementationStage = stage("IMPLEMENTATION", "READY_FOR_REVIEW");
        when(requirementMapper.selectById(100L)).thenReturn(requirement);
        when(workflowStageMapper.selectOne(any())).thenReturn(implementationStage);
        when(reviewMapper.selectList(any())).thenReturn(Arrays.asList(
            implementationReview("START_CHANGE", "APPROVED", 4L),
            implementationReview("ARTIFACT_REVIEW", "APPROVED", 3L),
            implementationReview("APPLY", "APPROVED", 2L)
        ));

        StageReviewRequest request = new StageReviewRequest();
        request.setRequirementPk(100L);
        request.setStage("IMPLEMENTATION");
        request.setDecision("APPROVED");

        // 缺少任一子步骤最新 APPROVED 结论时，Center 强制拒绝绕过前端的顶层审核。
        assertThatThrownBy(() -> service.review(1L, request))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.VALIDATION_FAILED);
    }

    @Test
    void reviewImplementationStageRiskAcceptedAfterAllStepsKeepsAdvanceSemantics() {
        PermissionService permissionService = org.mockito.Mockito.mock(PermissionService.class);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        ReviewService service = new ReviewService(permissionService, requirementMapper, workflowStageMapper, reviewMapper, domainEventService);
        RequirementEntity requirement = requirement();
        requirement.setCurrentStage("IMPLEMENTATION");
        WorkflowStageEntity implementationStage = stage("IMPLEMENTATION", "READY_FOR_REVIEW");
        WorkflowStageEntity codeReviewStage = stage("CODE_REVIEW", "NOT_STARTED");
        when(requirementMapper.selectById(100L)).thenReturn(requirement);
        when(workflowStageMapper.selectOne(any())).thenReturn(implementationStage, codeReviewStage);
        when(reviewMapper.selectList(any())).thenReturn(approvedImplementationStepReviews());

        StageReviewRequest request = new StageReviewRequest();
        request.setRequirementPk(100L);
        request.setStage("IMPLEMENTATION");
        request.setDecision("RISK_ACCEPTED");
        service.review(1L, request);

        // 顶层带风险通过沿用阶段审核语义：满足四步前置条件后允许推进。
        assertThat(implementationStage.getStatus()).isEqualTo("APPROVED");
        assertThat(codeReviewStage.getStatus()).isEqualTo("DRAFT");
        assertThat(requirement.getCurrentStage()).isEqualTo("CODE_REVIEW");
        assertThat(requirement.getStatus()).isEqualTo("IN_PROGRESS");
    }

    @Test
    void reviewCodeReviewApprovalAdvancesToRetrospective() {
        PermissionService permissionService = org.mockito.Mockito.mock(PermissionService.class);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        ReviewService service = new ReviewService(permissionService, requirementMapper, workflowStageMapper, reviewMapper, domainEventService);
        RequirementEntity requirement = requirement();
        requirement.setCurrentStage("CODE_REVIEW");
        WorkflowStageEntity codeReviewStage = stage("CODE_REVIEW", "READY_FOR_REVIEW");
        WorkflowStageEntity retrospectiveStage = stage("RETROSPECTIVE", "NOT_STARTED");
        when(requirementMapper.selectById(100L)).thenReturn(requirement);
        when(workflowStageMapper.selectOne(any())).thenReturn(codeReviewStage, retrospectiveStage);

        StageReviewRequest request = new StageReviewRequest();
        request.setRequirementPk(100L);
        request.setStage("CODE_REVIEW");
        request.setDecision("APPROVED");
        service.review(1L, request);

        assertThat(codeReviewStage.getStatus()).isEqualTo("APPROVED");
        assertThat(retrospectiveStage.getStatus()).isEqualTo("DRAFT");
        assertThat(requirement.getCurrentStage()).isEqualTo("RETROSPECTIVE");
        assertThat(requirement.getStatus()).isEqualTo("IN_PROGRESS");
    }

    @Test
    void reviewRetrospectiveApprovalCompletesWorkflow() {
        PermissionService permissionService = org.mockito.Mockito.mock(PermissionService.class);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        ReviewService service = new ReviewService(permissionService, requirementMapper, workflowStageMapper, reviewMapper, domainEventService);
        RequirementEntity requirement = requirement();
        requirement.setCurrentStage("RETROSPECTIVE");
        WorkflowStageEntity retrospectiveStage = stage("RETROSPECTIVE", "READY_FOR_REVIEW");
        when(requirementMapper.selectById(100L)).thenReturn(requirement);
        when(workflowStageMapper.selectOne(any())).thenReturn(retrospectiveStage);

        StageReviewRequest request = new StageReviewRequest();
        request.setRequirementPk(100L);
        request.setStage("RETROSPECTIVE");
        request.setDecision("APPROVED");
        service.review(1L, request);

        assertThat(retrospectiveStage.getStatus()).isEqualTo("APPROVED");
        assertThat(requirement.getCurrentStage()).isEqualTo("DONE");
        assertThat(requirement.getStatus()).isEqualTo("DONE");
    }

    @Test
    void reviewCreatesMissingRetrospectiveStageForLegacyRequirement() {
        PermissionService permissionService = org.mockito.Mockito.mock(PermissionService.class);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        ReviewService service = new ReviewService(permissionService, requirementMapper, workflowStageMapper, reviewMapper, domainEventService);
        RequirementEntity requirement = requirement();
        requirement.setCurrentStage("RETROSPECTIVE");
        when(requirementMapper.selectById(100L)).thenReturn(requirement);
        when(workflowStageMapper.selectOne(any())).thenReturn(null);

        StageReviewRequest request = new StageReviewRequest();
        request.setRequirementPk(100L);
        request.setStage("RETROSPECTIVE");
        request.setDecision("APPROVED");
        service.review(1L, request);

        ArgumentCaptor<WorkflowStageEntity> captor = ArgumentCaptor.forClass(WorkflowStageEntity.class);
        verify(workflowStageMapper).insert(captor.capture());
        assertThat(captor.getValue().getStage()).isEqualTo("RETROSPECTIVE");
        assertThat(captor.getValue().getRequirementPk()).isEqualTo(100L);
        assertThat(requirement.getCurrentStage()).isEqualTo("DONE");
        assertThat(requirement.getStatus()).isEqualTo("DONE");
    }

    @Test
    void requirementServiceReturnsCenterReviews() {
        PermissionService permissionService = org.mockito.Mockito.mock(PermissionService.class);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        RequirementService service = new RequirementService(
            permissionService,
            requirementMapper,
            requirementProjectMapper,
            workflowStageMapper,
            reviewMapper
        );
        RequirementEntity requirement = requirement();
        requirement.setTitle("页面装修列表样式异常");
        requirement.setRequirementType("DEFECT");
        requirement.setBranchName("bugfix/opp#172014");
        ReviewEntity review = new ReviewEntity();
        review.setId(200L);
        review.setRequirementPk(100L);
        review.setStage("IMPLEMENTATION");
        review.setImplementationStep("START_CHANGE");
        review.setDecision("APPROVED");
        review.setActorId(1L);
        review.setCreatedAt(LocalDateTime.of(2026, 6, 14, 10, 0));
        when(requirementMapper.selectOne(any())).thenReturn(requirement);
        when(workflowStageMapper.selectList(any())).thenReturn(Collections.singletonList(stage("IMPLEMENTATION", "IN_PROGRESS")));
        when(requirementProjectMapper.selectList(any())).thenReturn(Collections.emptyList());
        when(reviewMapper.selectList(any())).thenReturn(Collections.singletonList(review));

        RequirementVO result = service.get(1L, 10L, "172014");

        assertThat(result.getReviews()).hasSize(1);
        assertThat(result.getReviews().get(0).getImplementationStep()).isEqualTo("START_CHANGE");
        assertThat(result.getReviews().get(0).getDecision()).isEqualTo("APPROVED");
    }

    @Test
    void issueServiceUpdatesSharedIssueStatus() {
        PermissionService permissionService = org.mockito.Mockito.mock(PermissionService.class);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        IssueService service = new IssueService(permissionService, issueMapper, requirementMapper, domainEventService);
        IssueEntity issue = new IssueEntity();
        issue.setId(99L);
        issue.setRequirementPk(100L);
        issue.setSeverity("BLOCKER");
        issue.setStatus("OPEN");
        issue.setTitle("缺少单测");
        when(issueMapper.selectById(99L)).thenReturn(issue);
        when(requirementMapper.selectById(100L)).thenReturn(requirement());

        IssueStatusUpdateRequest request = new IssueStatusUpdateRequest();
        request.setStatus("FIXED");
        service.updateStatus(1L, 99L, request);

        ArgumentCaptor<IssueEntity> captor = ArgumentCaptor.forClass(IssueEntity.class);
        verify(issueMapper).updateById(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo("FIXED");
    }

    @Test
    void issueServiceCreatesOpenSharedIssue() {
        PermissionService permissionService = org.mockito.Mockito.mock(PermissionService.class);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        IssueService service = new IssueService(permissionService, issueMapper, requirementMapper, domainEventService);
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        IssueCreateRequest request = new IssueCreateRequest();
        request.setRequirementPk(100L);
        request.setSeverity("BLOCKER");
        request.setTitle("缺少单测");

        service.create(1L, request);

        ArgumentCaptor<IssueEntity> captor = ArgumentCaptor.forClass(IssueEntity.class);
        verify(issueMapper).insert(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo("OPEN");
        assertThat(captor.getValue().getSeverity()).isEqualTo("BLOCKER");
    }

    private RequirementEntity requirement() {
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(100L);
        requirement.setProjectId(10L);
        requirement.setRequirementId("172014");
        requirement.setCurrentStage("PRD");
        requirement.setStatus("IN_PROGRESS");
        return requirement;
    }

    private ProjectEntity project() {
        ProjectEntity project = new ProjectEntity();
        project.setId(10L);
        project.setTeamId(20L);
        project.setName("AI Delivery");
        project.setCode("ai-delivery");
        return project;
    }

    private WorkflowStageEntity stage(String stage, String status) {
        WorkflowStageEntity entity = new WorkflowStageEntity();
        entity.setId((long) stage.hashCode());
        entity.setRequirementPk(100L);
        entity.setStage(stage);
        entity.setStatus(status);
        entity.setVersion(0L);
        return entity;
    }

    private List<ReviewEntity> approvedImplementationStepReviews() {
        return Arrays.asList(
            implementationReview("CHANGE_INSPECTION", "APPROVED", 4L),
            implementationReview("APPLY", "APPROVED", 3L),
            implementationReview("ARTIFACT_REVIEW", "APPROVED", 2L),
            implementationReview("START_CHANGE", "APPROVED", 1L)
        );
    }

    private ReviewEntity implementationReview(String step, String decision, Long id) {
        ReviewEntity review = new ReviewEntity();
        review.setId(id);
        review.setRequirementPk(100L);
        review.setStage("IMPLEMENTATION");
        review.setImplementationStep(step);
        review.setDecision(decision);
        review.setCreatedAt(LocalDateTime.of(2026, 6, 14, 10, id.intValue()));
        return review;
    }
}
