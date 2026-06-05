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
import com.opp.aidelivery.center.mapper.ReviewMapper;
import com.opp.aidelivery.center.mapper.TeamMemberMapper;
import com.opp.aidelivery.center.mapper.WorkflowStageMapper;
import com.opp.aidelivery.center.model.dto.IssueCreateRequest;
import com.opp.aidelivery.center.model.dto.IssueStatusUpdateRequest;
import com.opp.aidelivery.center.model.dto.StageReviewRequest;
import com.opp.aidelivery.center.model.entity.IssueEntity;
import com.opp.aidelivery.center.model.entity.ProjectEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.TeamMemberEntity;
import com.opp.aidelivery.center.model.entity.WorkflowStageEntity;
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
}
