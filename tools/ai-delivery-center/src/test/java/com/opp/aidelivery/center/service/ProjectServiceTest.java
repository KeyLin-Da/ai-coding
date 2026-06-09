package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ProjectMapper;
import com.opp.aidelivery.center.mapper.ProjectRepositoryMapper;
import com.opp.aidelivery.center.mapper.TeamMapper;
import com.opp.aidelivery.center.mapper.TeamMemberMapper;
import com.opp.aidelivery.center.model.AiDeliveryConstants;
import com.opp.aidelivery.center.model.dto.ProjectCreateRequest;
import com.opp.aidelivery.center.model.dto.ProjectJoinRequest;
import com.opp.aidelivery.center.model.dto.ProjectRepositoryRequest;
import com.opp.aidelivery.center.model.entity.ProjectEntity;
import com.opp.aidelivery.center.model.entity.ProjectRepositoryEntity;
import com.opp.aidelivery.center.model.entity.TeamEntity;
import com.opp.aidelivery.center.model.entity.TeamMemberEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ProjectServiceTest {

    @Mock
    private ProjectMapper projectMapper;
    @Mock
    private ProjectRepositoryMapper projectRepositoryMapper;
    @Mock
    private TeamMapper teamMapper;
    @Mock
    private TeamMemberMapper teamMemberMapper;
    @Mock
    private PermissionService permissionService;

    private ProjectService projectService;

    @BeforeEach
    void setUp() {
        projectService = new ProjectService(projectMapper, projectRepositoryMapper, teamMapper, teamMemberMapper, permissionService);
    }

    @Test
    void createProjectCreatesOwnerMember() {
        // 验证创建项目必须带产物仓，并自动创建项目团队、OWNER 成员和仓库配置。
        when(projectMapper.selectOne(any())).thenReturn(null);
        when(projectRepositoryMapper.selectOne(any())).thenReturn(null);
        when(teamMapper.insert(any(TeamEntity.class))).thenAnswer(invocation -> {
            invocation.<TeamEntity>getArgument(0).setId(20L);
            return 1;
        });
        when(projectMapper.insert(any(ProjectEntity.class))).thenAnswer(invocation -> {
            invocation.<ProjectEntity>getArgument(0).setId(10L);
            return 1;
        });
        ProjectCreateRequest request = createRequest();

        assertThat(projectService.create(1L, request).getRole()).isEqualTo(AiDeliveryConstants.ROLE_OWNER);

        ArgumentCaptor<TeamMemberEntity> memberCaptor = ArgumentCaptor.forClass(TeamMemberEntity.class);
        verify(teamMemberMapper).insert(memberCaptor.capture());
        assertThat(memberCaptor.getValue().getRole()).isEqualTo(AiDeliveryConstants.ROLE_OWNER);
        assertThat(memberCaptor.getValue().getUserId()).isEqualTo(1L);
        ArgumentCaptor<ProjectRepositoryEntity> repoCaptor = ArgumentCaptor.forClass(ProjectRepositoryEntity.class);
        verify(projectRepositoryMapper).insert(repoCaptor.capture());
        assertThat(repoCaptor.getValue().getRepoUrl()).isEqualTo("git@git.example.com:opp/ai-artifacts.git");
        assertThat(repoCaptor.getValue().getDefaultBranch()).isEqualTo("master");
    }

    @Test
    void createProjectReportsCodeConflictAfterRetries() {
        // 验证短项目码连续冲突时返回明确错误，而不是插入不可用项目码。
        when(projectMapper.selectOne(any())).thenReturn(new ProjectEntity());
        ProjectCreateRequest request = createRequest();

        assertThatThrownBy(() -> projectService.create(1L, request))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.PROJECT_CODE_CONFLICT);
    }

    @Test
    void joinProjectAddsMemberWhenCodeValid() {
        // 验证用户输入有效项目码后会加入项目所在团队。
        ProjectEntity project = project();
        when(projectMapper.selectOne(any())).thenReturn(project);
        when(teamMemberMapper.selectOne(any())).thenReturn(null);
        ProjectJoinRequest request = new ProjectJoinRequest();
        request.setCode("ai-delivery");

        assertThat(projectService.join(1L, request).getRole()).isEqualTo(AiDeliveryConstants.ROLE_MEMBER);
        verify(teamMemberMapper).insert(any(TeamMemberEntity.class));
    }

    @Test
    void joinProjectRejectsInvalidCode() {
        // 验证无效项目码不会授予任何项目权限。
        when(projectMapper.selectOne(any())).thenReturn(null);
        ProjectJoinRequest request = new ProjectJoinRequest();
        request.setCode("missing");

        assertThatThrownBy(() -> projectService.join(1L, request))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.PROJECT_JOIN_DENIED);
    }

    private ProjectEntity project() {
        ProjectEntity project = new ProjectEntity();
        project.setId(10L);
        project.setTeamId(20L);
        project.setName("AI Delivery");
        project.setCode("ai-delivery");
        project.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        return project;
    }

    private ProjectCreateRequest createRequest() {
        ProjectRepositoryRequest repository = new ProjectRepositoryRequest();
        repository.setProvider("GITLAB");
        repository.setRepoUrl("git@git.example.com:opp/ai-artifacts.git");
        repository.setDefaultBranch("master");
        ProjectCreateRequest request = new ProjectCreateRequest();
        request.setName("AI Delivery");
        request.setRepository(repository);
        return request;
    }
}
