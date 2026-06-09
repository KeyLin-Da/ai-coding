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
    private UserDeliveryWorkspaceMapper workspaceMapper;

    private DeliveryWorkspaceService service;

    @BeforeEach
    void setUp() {
        service = new DeliveryWorkspaceService(workspaceMapper);
    }

    @Test
    void saveCreatesUserClientWorkspace() {
        when(workspaceMapper.selectOne(any())).thenReturn(null);
        DeliveryWorkspaceSaveRequest request = request("/Users/me/ai-delivery");

        assertThat(service.save(1L, request).getLocalPath()).isEqualTo("/Users/me/ai-delivery");

        ArgumentCaptor<UserDeliveryWorkspaceEntity> captor = ArgumentCaptor.forClass(UserDeliveryWorkspaceEntity.class);
        verify(workspaceMapper).insert(captor.capture());
        assertThat(captor.getValue().getUserId()).isEqualTo(1L);
        assertThat(captor.getValue().getClientSessionId()).isEqualTo(9L);
        assertThat(captor.getValue().getStatus()).isEqualTo(AiDeliveryConstants.STATUS_ACTIVE);
    }

    @Test
    void saveRejectsRelativePath() {
        assertThatThrownBy(() -> service.save(1L, request("relative/path")))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.WORKSPACE_PATH_INVALID);
    }

    private DeliveryWorkspaceSaveRequest request(String localPath) {
        DeliveryWorkspaceSaveRequest request = new DeliveryWorkspaceSaveRequest();
        request.setClientSessionId(9L);
        request.setLocalPath(localPath);
        return request;
    }
}
