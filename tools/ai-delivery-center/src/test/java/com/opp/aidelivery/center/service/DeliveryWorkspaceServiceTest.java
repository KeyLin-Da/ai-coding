package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.UserDeliveryWorkspaceMapper;
import com.opp.aidelivery.center.model.AiDeliveryConstants;
import com.opp.aidelivery.center.model.dto.DeliveryWorkspaceSaveRequest;
import com.opp.aidelivery.center.model.entity.ProjectEntity;
import com.opp.aidelivery.center.model.entity.UserDeliveryWorkspaceEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DeliveryWorkspaceServiceTest {

    @Mock
    private PermissionService permissionService;
    @Mock
    private UserDeliveryWorkspaceMapper workspaceMapper;

    private DeliveryWorkspaceService service;

    @BeforeEach
    void setUp() {
        service = new DeliveryWorkspaceService(permissionService, workspaceMapper);
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(new ProjectEntity());
    }

    @Test
    void saveCreatesUserProjectWorkspace() {
        when(workspaceMapper.selectOne(any())).thenReturn(null);
        DeliveryWorkspaceSaveRequest request = request("/Users/me/ai-delivery");

        assertThat(service.save(1L, 10L, request).getLocalPath()).isEqualTo("/Users/me/ai-delivery");

        ArgumentCaptor<UserDeliveryWorkspaceEntity> captor = ArgumentCaptor.forClass(UserDeliveryWorkspaceEntity.class);
        verify(workspaceMapper).insert(captor.capture());
        assertThat(captor.getValue().getUserId()).isEqualTo(1L);
        assertThat(captor.getValue().getProjectId()).isEqualTo(10L);
        assertThat(captor.getValue().getClientSessionId()).isNull();
        assertThat(captor.getValue().getStatus()).isEqualTo(AiDeliveryConstants.STATUS_ACTIVE);
        verify(permissionService).assertProjectMember(1L, 10L);
    }

    @Test
    void getLoadsUserProjectWorkspace() {
        UserDeliveryWorkspaceEntity entity = new UserDeliveryWorkspaceEntity();
        entity.setId(2L);
        entity.setUserId(1L);
        entity.setProjectId(10L);
        entity.setLocalPath("/Users/me/ai-delivery");
        entity.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        when(workspaceMapper.selectOne(any())).thenReturn(entity);

        assertThat(service.get(1L, 10L).getProjectId()).isEqualTo(10L);
        verify(permissionService).assertProjectMember(1L, 10L);
    }

    @Test
    void saveRejectsRelativePath() {
        assertThatThrownBy(() -> service.save(1L, 10L, request("relative/path")))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.WORKSPACE_PATH_INVALID);
    }

    private DeliveryWorkspaceSaveRequest request(String localPath) {
        DeliveryWorkspaceSaveRequest request = new DeliveryWorkspaceSaveRequest();
        request.setLocalPath(localPath);
        return request;
    }
}
