package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.mapper.WsSessionMapper;
import com.opp.aidelivery.center.model.entity.WsSessionEntity;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class WsSessionService {

    private final AiDeliveryCenterProperties properties;
    private final WsSessionMapper wsSessionMapper;
    private final DomainEventService domainEventService;

    @Transactional(rollbackFor = Exception.class)
    public WsSessionEntity connect(String sessionId, Long userId, Long clientSessionId) {
        WsSessionEntity existing = wsSessionMapper.selectOne(new LambdaQueryWrapper<WsSessionEntity>()
            .eq(WsSessionEntity::getSessionId, sessionId)
            .last("LIMIT 1"));
        LocalDateTime now = LocalDateTime.now();
        WsSessionEntity session = existing == null ? new WsSessionEntity() : existing;
        session.setUserId(userId);
        session.setClientSessionId(clientSessionId);
        session.setSessionId(sessionId);
        session.setConnectedAt(existing == null ? now : existing.getConnectedAt());
        session.setLastSeenAt(now);
        session.setLastAckEventId(existing == null || existing.getLastAckEventId() == null ? 0L : existing.getLastAckEventId());
        session.setStatus("ONLINE");
        if (existing == null) {
            wsSessionMapper.insert(session);
        } else {
            wsSessionMapper.updateById(session);
        }
        return session;
    }

    @Transactional(rollbackFor = Exception.class)
    public void heartbeat(String sessionId, Long projectId) {
        WsSessionEntity session = loadBySessionId(sessionId);
        session.setLastSeenAt(LocalDateTime.now());
        session.setStatus("ONLINE");
        if (projectId != null) {
            session.setLastProjectId(projectId);
        }
        wsSessionMapper.updateById(session);
        if (projectId != null) {
            publishPresence(projectId, session, "ONLINE");
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public void disconnect(String sessionId) {
        WsSessionEntity session = loadBySessionIdOrNull(sessionId);
        if (session == null) {
            return;
        }
        session.setStatus("OFFLINE");
        session.setLastSeenAt(LocalDateTime.now());
        wsSessionMapper.updateById(session);
        publishPresence(session.getLastProjectId(), session, "OFFLINE");
    }

    @Transactional(rollbackFor = Exception.class)
    public void ack(String sessionId, Long lastEventId) {
        WsSessionEntity session = loadBySessionId(sessionId);
        long current = session.getLastAckEventId() == null ? 0L : session.getLastAckEventId();
        if (lastEventId != null && lastEventId > current) {
            session.setLastAckEventId(lastEventId);
            session.setLastSeenAt(LocalDateTime.now());
            wsSessionMapper.updateById(session);
        }
    }

    @Scheduled(fixedDelay = 30000)
    @Transactional(rollbackFor = Exception.class)
    public void markIdleSessionsOffline() {
        LocalDateTime threshold = LocalDateTime.now().minus(properties.getWebsocket().getSessionIdleTimeout());
        List<WsSessionEntity> sessions = wsSessionMapper.selectList(new LambdaQueryWrapper<WsSessionEntity>()
            .eq(WsSessionEntity::getStatus, "ONLINE")
            .lt(WsSessionEntity::getLastSeenAt, threshold));
        for (WsSessionEntity session : sessions) {
            session.setStatus("OFFLINE");
            wsSessionMapper.updateById(session);
            publishPresence(session.getLastProjectId(), session, "OFFLINE");
        }
    }

    private WsSessionEntity loadBySessionId(String sessionId) {
        WsSessionEntity session = loadBySessionIdOrNull(sessionId);
        if (session == null) {
            throw new IllegalStateException("WebSocket session not found: " + sessionId);
        }
        return session;
    }

    private WsSessionEntity loadBySessionIdOrNull(String sessionId) {
        return wsSessionMapper.selectOne(new LambdaQueryWrapper<WsSessionEntity>()
            .eq(WsSessionEntity::getSessionId, sessionId)
            .last("LIMIT 1"));
    }

    private void publishPresence(Long projectId, WsSessionEntity session, String status) {
        if (projectId == null) {
            return;
        }
        domainEventService.publishAfterCommit(
            projectId,
            "client.presence.updated",
            "CLIENT_SESSION",
            session.getClientSessionId(),
            "{\"userId\":" + session.getUserId()
                + ",\"clientSessionId\":" + session.getClientSessionId()
                + ",\"status\":\"" + status + "\"}"
        );
    }
}
