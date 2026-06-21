package com.opp.aidelivery.center.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.opp.aidelivery.center.model.entity.DomainEventEntity;
import com.opp.aidelivery.center.model.entity.RunEventEntity;
import java.util.HashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class RealtimeEventBroker {

    private final SimpMessagingTemplate messagingTemplate;
    private final ObjectProvider<RealtimeClusterPublisher> clusterPublisher;
    private final ObjectMapper objectMapper;
    private final ArtifactShareService artifactShareService;

    public void broadcast(DomainEventEntity event) {
        broadcastLocal(event);
        clusterPublisher.ifAvailable(publisher -> publisher.publish(event));
    }

    public void broadcast(RunEventEntity event) {
        broadcastLocal(event);
        clusterPublisher.ifAvailable(publisher -> publisher.publish(event));
    }

    public void broadcastLocal(DomainEventEntity event) {
        messagingTemplate.convertAndSend("/topic/projects/" + event.getProjectId() + "/events", event);
        Long requirementPk = extractRequirementPk(event.getPayloadJson());
        if (requirementPk != null) {
            messagingTemplate.convertAndSend("/topic/requirements/" + requirementPk + "/events", event);
        }
        if (requirementPk != null && "tech-design.annotation.changed".equals(event.getEventType())) {
            broadcastShareAnnotationChanges(event, requirementPk);
        }
    }

    public void broadcastLocal(RunEventEntity event) {
        messagingTemplate.convertAndSend("/topic/runs/" + event.getRunId() + "/events", event);
    }

    private Long extractRequirementPk(String payloadJson) {
        if (payloadJson == null) {
            return null;
        }
        try {
            JsonNode requirementPk = objectMapper.readTree(payloadJson).path("requirementPk");
            return requirementPk.isNumber() ? requirementPk.asLong() : null;
        } catch (Exception exception) {
            return null;
        }
    }

    private void broadcastShareAnnotationChanges(DomainEventEntity event, Long requirementPk) {
        for (Map.Entry<Long, String> channel : artifactShareService.listRealtimeAnnotationChannels(requirementPk).entrySet()) {
            Map<String, Object> payload = new HashMap<>();
            payload.put("shareId", channel.getKey());
            payload.put("eventId", event.getEventId());
            payload.put("eventType", event.getEventType());
            copyPayloadField(event.getPayloadJson(), payload, "operation");
            copyPayloadField(event.getPayloadJson(), payload, "revision");
            messagingTemplate.convertAndSend(
                "/topic/artifact-shares/" + channel.getKey() + "/" + channel.getValue() + "/annotations",
                payload
            );
        }
    }

    private void copyPayloadField(String payloadJson, Map<String, Object> target, String fieldName) {
        if (payloadJson == null) {
            return;
        }
        try {
            JsonNode value = objectMapper.readTree(payloadJson).get(fieldName);
            if (value != null && !value.isNull()) {
                target.put(fieldName, objectMapper.treeToValue(value, Object.class));
            }
        } catch (Exception ignored) {
            // The share notification is only an invalidation hint; optional fields may be omitted.
        }
    }
}
