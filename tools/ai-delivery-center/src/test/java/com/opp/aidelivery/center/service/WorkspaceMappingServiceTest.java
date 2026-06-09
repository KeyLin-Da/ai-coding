package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.UserProjectWorkspaceMapper;
import com.opp.aidelivery.center.model.AiDeliveryConstants;
import com.opp.aidelivery.center.model.dto.WorkspaceMappingSaveRequest;
import com.opp.aidelivery.center.model.entity.ProjectEntity;
import com.opp.aidelivery.center.model.entity.UserProjectWorkspaceEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class WorkspaceMappingServiceTest {

    @Mock
    private PermissionService permissionService;
    @Mock
    private UserProjectWorkspaceMapper workspaceMapper;

    private WorkspaceMappingService workspaceMappingService;

    @BeforeEach
    void setUp() {
        workspaceMappingService = new WorkspaceMappingService(permissionService, workspaceMapper);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(new ProjectEntity());
    }

    @Test
    void saveCreatesPrivateAbsolutePathMapping() {
        // 验证用户只能在有权限的项目下保存自己的绝对路径配置。
        when(workspaceMapper.selectOne(any())).thenReturn(null);
        WorkspaceMappingSaveRequest request = new WorkspaceMappingSaveRequest();
        request.setLocalPath("/Users/key.lin/work");

        workspaceMappingService.save(1L, 10L, request);

        ArgumentCaptor<UserProjectWorkspaceEntity> captor = ArgumentCaptor.forClass(UserProjectWorkspaceEntity.class);
        verify(workspaceMapper).insert(captor.capture());
        assertThat(captor.getValue().getUserId()).isEqualTo(1L);
        assertThat(captor.getValue().getProjectId()).isEqualTo(10L);
        assertThat(captor.getValue().getStatus()).isEqualTo(AiDeliveryConstants.STATUS_ACTIVE);
    }

    @Test
    void saveReusesDuplicatePath() {
        // 验证重复路径不会插入第二条记录，而是更新已有私有配置。
        UserProjectWorkspaceEntity existing = new UserProjectWorkspaceEntity();
        existing.setId(99L);
        when(workspaceMapper.selectOne(any())).thenReturn(existing);
        WorkspaceMappingSaveRequest request = new WorkspaceMappingSaveRequest();
        request.setLocalPath("/Users/key.lin/work");

        workspaceMappingService.save(1L, 10L, request);

        verify(workspaceMapper).updateById(existing);
    }

    @Test
    void saveRejectsRelativePath() {
        // 验证相对路径不会进入中心私有配置表。
        WorkspaceMappingSaveRequest request = new WorkspaceMappingSaveRequest();
        request.setLocalPath("relative/path");

        assertThatThrownBy(() -> workspaceMappingService.save(1L, 10L, request))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.WORKSPACE_PATH_INVALID);
    }

    @Test
    void disableRejectsOtherUsersMapping() {
        // 验证禁用路径时按 user + project 过滤，查不到就视为无权访问。
        when(workspaceMapper.selectOne(any())).thenReturn(null);

        assertThatThrownBy(() -> workspaceMappingService.disable(1L, 10L, 99L))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.WORKSPACE_PATH_DENIED);
    }
}
