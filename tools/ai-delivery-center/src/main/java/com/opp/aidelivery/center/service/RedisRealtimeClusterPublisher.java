package com.opp.aidelivery.center.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.model.entity.DomainEventEntity;
import com.opp.aidelivery.center.model.entity.RunEventEntity;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "ai-delivery.center.websocket", name = "broker", havingValue = "redis")
public class RedisRealtimeClusterPublisher implements RealtimeClusterPublisher, MessageListener {

    private final String nodeId = UUID.randomUUID().toString();

    private final AiDeliveryCenterProperties properties;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;
    private final RealtimeEventBroker realtimeEventBroker;

    @Override
    public void publish(DomainEventEntity event) {
        publish("DOMAIN", event.getProjectId(), event);
    }

    @Override
    public void publish(RunEventEntity event) {
        publish("RUN", event.getRunId(), event);
    }

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String json = new String(message.getBody(), StandardCharsets.UTF_8);
            JsonNode root = objectMapper.readTree(json);
            if (nodeId.equals(root.path("nodeId").asText())) {
                return;
            }
            String type = root.path("type").asText();
            JsonNode payload = root.path("payload");
            if ("DOMAIN".equals(type)) {
                realtimeEventBroker.broadcastLocal(objectMapper.treeToValue(payload, DomainEventEntity.class));
            } else if ("RUN".equals(type)) {
                realtimeEventBroker.broadcastLocal(objectMapper.treeToValue(payload, RunEventEntity.class));
            }
        } catch (Exception ignored) {
            // Redis Pub/Sub is a best-effort fanout layer; DB compensation remains the reliable source.
        }
    }

    private void publish(String type, Long scopeId, Object payload) {
        try {
            String channel = properties.getWebsocket().getRedisChannelPrefix() + ":" + scopeId;
            String json = objectMapper.writeValueAsString(new ClusterMessage(nodeId, type, payload));
            redisTemplate.convertAndSend(channel, json);
        } catch (Exception ignored) {
            // Local WebSocket delivery already happened; clients can recover missed events by lastEventId.
        }
    }

    private static class ClusterMessage {
        private final String nodeId;
        private final String type;
        private final Object payload;

        private ClusterMessage(String nodeId, String type, Object payload) {
            this.nodeId = nodeId;
            this.type = type;
            this.payload = payload;
        }

        public String getNodeId() {
            return nodeId;
        }

        public String getType() {
            return type;
        }

        public Object getPayload() {
            return payload;
        }
    }
}
