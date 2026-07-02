package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.mapper.WsSessionMapper;
import com.opp.aidelivery.center.model.entity.WsSessionEntity;
import java.time.LocalDateTime;
import java.util.Collections;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class WsSessionServiceTest {

    @Mock
    private WsSessionMapper wsSessionMapper;
    @Mock
    private DomainEventService domainEventService;

    private WsSessionService wsSessionService;

    @BeforeEach
    void setUp() {
        wsSessionService = new WsSessionService(new AiDeliveryCenterProperties(), wsSessionMapper, domainEventService);
    }

    @Test
    void ackStoresOnlyNewerEventId() {
        WsSessionEntity session = session();
        session.setLastAckEventId(20L);
        when(wsSessionMapper.selectOne(any())).thenReturn(session);

        wsSessionService.ack("ws-1", 10L);

        verify(wsSessionMapper, never()).updateById(any());

        wsSessionService.ack("ws-1", 21L);

        assertThat(session.getLastAckEventId()).isEqualTo(21L);
        verify(wsSessionMapper).updateById(session);
    }

    @Test
    void heartbeatStoresProjectAndPublishesPresence() {
        WsSessionEntity session = session();
        when(wsSessionMapper.selectOne(any())).thenReturn(session);

        wsSessionService.heartbeat("ws-1", 10L);

        assertThat(session.getLastProjectId()).isEqualTo(10L);
        verify(wsSessionMapper).updateById(session);
        verify(domainEventService).publishAfterCommit(eq(10L), eq("client.presence.updated"), eq("CLIENT_SESSION"), eq(3L), contains("\"status\":\"ONLINE\""));
    }

    @Test
    void idleCleanupPublishesOfflinePresence() {
        WsSessionEntity session = session();
        session.setLastProjectId(10L);
        when(wsSessionMapper.selectList(any())).thenReturn(Collections.singletonList(session));

        wsSessionService.markIdleSessionsOffline();

        assertThat(session.getStatus()).isEqualTo("OFFLINE");
        verify(domainEventService).publishAfterCommit(eq(10L), eq("client.presence.updated"), eq("CLIENT_SESSION"), eq(3L), contains("\"status\":\"OFFLINE\""));
    }

    private WsSessionEntity session() {
        WsSessionEntity session = new WsSessionEntity();
        session.setId(1L);
        session.setUserId(2L);
        session.setClientSessionId(3L);
        session.setSessionId("ws-1");
        session.setConnectedAt(LocalDateTime.now());
        session.setLastSeenAt(LocalDateTime.now());
        session.setLastAckEventId(0L);
        session.setStatus("ONLINE");
        return session;
    }
}
