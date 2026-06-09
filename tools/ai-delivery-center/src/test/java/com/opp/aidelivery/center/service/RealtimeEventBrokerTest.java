package com.opp.aidelivery.center.service;

import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.opp.aidelivery.center.model.entity.DomainEventEntity;
import com.opp.aidelivery.center.model.entity.RunEventEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.simp.SimpMessagingTemplate;

@ExtendWith(MockitoExtension.class)
class RealtimeEventBrokerTest {

    @Mock
    private SimpMessagingTemplate messagingTemplate;
    @Mock
    private ObjectProvider<RealtimeClusterPublisher> clusterPublisher;

    private RealtimeEventBroker broker;

    @BeforeEach
    void setUp() {
        broker = new RealtimeEventBroker(messagingTemplate, clusterPublisher, new ObjectMapper());
    }

    @Test
    void broadcastLocalSendsProjectAndRequirementTopics() {
        DomainEventEntity event = new DomainEventEntity();
        event.setProjectId(10L);
        event.setPayloadJson("{\"requirementPk\":100}");

        broker.broadcastLocal(event);

        verify(messagingTemplate).convertAndSend("/topic/projects/10/events", event);
        verify(messagingTemplate).convertAndSend("/topic/requirements/100/events", event);
    }

    @Test
    void broadcastLocalSendsRunTopic() {
        RunEventEntity event = new RunEventEntity();
        event.setRunId(700L);

        broker.broadcastLocal(event);

        verify(messagingTemplate).convertAndSend("/topic/runs/700/events", event);
    }
}
