package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ClientSessionMapper;
import com.opp.aidelivery.center.model.dto.ClientSessionRegisterRequest;
import com.opp.aidelivery.center.model.entity.ClientSessionEntity;
import com.opp.aidelivery.center.model.vo.ClientSessionVO;
import java.util.Arrays;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ClientSessionServiceTest {

    @Mock
    private ClientSessionMapper clientSessionMapper;

    private ClientSessionService clientSessionService;

    @BeforeEach
    void setUp() {
        clientSessionService = new ClientSessionService(clientSessionMapper);
    }

    @Test
    void registerStoresOnlyCapabilitySummary() {
        ClientSessionRegisterRequest request = new ClientSessionRegisterRequest();
        request.setOsType("darwin");
        request.setCapabilities(Arrays.asList("codex", "openspec", "git"));

        ClientSessionVO result = clientSessionService.register(1L, request);

        assertThat(result.getOsType()).isEqualTo("MACOS");
        ArgumentCaptor<ClientSessionEntity> captor = ArgumentCaptor.forClass(ClientSessionEntity.class);
        verify(clientSessionMapper).insert(captor.capture());
        assertThat(captor.getValue().getCapabilities()).isEqualTo("[\"CODEX\",\"OPENSPEC\",\"GIT\"]");
        assertThat(captor.getValue().getStatus()).isEqualTo("ONLINE");
    }

    @Test
    void registerRejectsLocalPathOrTokenLikeCapability() {
        ClientSessionRegisterRequest request = new ClientSessionRegisterRequest();
        request.setOsType("windows");
        request.setCapabilities(Arrays.asList("CODEX", "C:\\Users\\me\\.codex-token"));

        assertThatThrownBy(() -> clientSessionService.register(1L, request))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.VALIDATION_FAILED);

        verify(clientSessionMapper, never()).insert(any());
    }
}
