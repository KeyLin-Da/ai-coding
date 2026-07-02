package com.opp.aidelivery.center.service;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.opp.aidelivery.center.model.entity.DomainEventEntity;
import com.opp.aidelivery.center.model.entity.RunEventEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.simp.SimpMessagingTemplate;

@ExtendWith(MockitoExtension.class)
class RealtimeEventBrokerTest {

    @Mock
    private SimpMessagingTemplate messagingTemplate;
    @Mock
    private ObjectProvider<RealtimeClusterPublisher> clusterPublisher;
    @Mock
    private ArtifactShareService artifactShareService;

    private RealtimeEventBroker broker;

    @BeforeEach
    void setUp() {
        broker = new RealtimeEventBroker(messagingTemplate, clusterPublisher, new ObjectMapper(), artifactShareService);
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

    @Test
    void annotationChangeSendsMinimalShareScopedNotification() {
        DomainEventEntity event = new DomainEventEntity();
        event.setProjectId(10L);
        event.setEventId(88L);
        event.setEventType("tech-design.annotation.changed");
        event.setPayloadJson("{\"requirementPk\":100,\"requirementId\":\"172014\",\"operation\":\"CREATED\",\"revision\":99}");
        when(artifactShareService.listRealtimeAnnotationChannels(100L))
            .thenReturn(java.util.Collections.singletonMap(300L, "channel-hash"));

        broker.broadcastLocal(event);

        ArgumentCaptor<Object> payloadCaptor = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(
            org.mockito.ArgumentMatchers.eq("/topic/artifact-shares/300/channel-hash/annotations"),
            payloadCaptor.capture()
        );
        java.util.Map<?, ?> values = (java.util.Map<?, ?>) payloadCaptor.getValue();
        org.assertj.core.api.Assertions.assertThat(values.get("shareId")).isEqualTo(300L);
        org.assertj.core.api.Assertions.assertThat(values.get("eventId")).isEqualTo(88L);
        org.assertj.core.api.Assertions.assertThat(values.get("operation")).isEqualTo("CREATED");
        org.assertj.core.api.Assertions.assertThat(values.containsKey("requirementPk")).isFalse();
        org.assertj.core.api.Assertions.assertThat(values.containsKey("projectId")).isFalse();
    }
}
