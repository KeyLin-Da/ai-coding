package com.opp.aidelivery.center.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.opp.aidelivery.center.model.entity.DomainEventEntity;
import com.opp.aidelivery.center.model.entity.RunEventEntity;
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
}
