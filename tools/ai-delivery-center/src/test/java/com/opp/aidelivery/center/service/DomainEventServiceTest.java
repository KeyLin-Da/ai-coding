package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.model.entity.DomainEventEntity;
import com.opp.aidelivery.center.model.vo.EventPageVO;
import com.opp.aidelivery.center.repository.DomainEventRepository;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Arrays;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@ExtendWith(MockitoExtension.class)
class DomainEventServiceTest {

    @Mock
    private DomainEventRepository domainEventRepository;
    @Mock
    private RealtimeEventBroker realtimeEventBroker;

    private AiDeliveryCenterProperties properties;
    private DomainEventService domainEventService;

    @BeforeEach
    void setUp() {
        properties = new AiDeliveryCenterProperties();
        properties.getEvent().setRetainedWindow(Duration.ofDays(7));
        properties.getEvent().setPageSize(100);
        domainEventService = new DomainEventService(properties, domainEventRepository, realtimeEventBroker);
        lenient().when(domainEventRepository.save(any(DomainEventEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    @Test
    void publishAfterCommitPersistsAndBroadcastsOnlyAfterTransactionCommit() {
        TransactionSynchronizationManager.initSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(true);

        domainEventService.publishAfterCommit(10L, "workflow.stage.reviewed", "REQUIREMENT", 100L, "{\"requirementPk\":100}");

        verify(domainEventRepository, never()).save(any());
        TransactionSynchronizationManager.getSynchronizations().forEach(item -> item.afterCommit());

        ArgumentCaptor<DomainEventEntity> captor = ArgumentCaptor.forClass(DomainEventEntity.class);
        verify(domainEventRepository).save(captor.capture());
        verify(realtimeEventBroker).broadcast(captor.getValue());
        assertThat(captor.getValue().getEventType()).isEqualTo("workflow.stage.reviewed");
        assertThat(captor.getValue().getEventId()).isPositive();
    }

    @Test
    void publishNowAssignsMonotonicEventIds() {
        domainEventService.publishNow(10L, "issue.created", "ISSUE", 1L, "{}");
        domainEventService.publishNow(10L, "issue.status.changed", "ISSUE", 1L, "{}");

        ArgumentCaptor<DomainEventEntity> captor = ArgumentCaptor.forClass(DomainEventEntity.class);
        verify(domainEventRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        assertThat(captor.getAllValues().get(1).getEventId()).isGreaterThan(captor.getAllValues().get(0).getEventId());
    }

    @Test
    void listAfterReturnsRefreshRequiredWhenRetainedHistoryExpired() {
        when(domainEventRepository.firstRetainedEventId(eq(10L), any(LocalDateTime.class))).thenReturn(500L);

        EventPageVO page = domainEventService.listAfter(10L, 100L);

        assertThat(page.isRefreshRequired()).isTrue();
        assertThat(page.getRefreshScope()).isEqualTo("PROJECT");
        assertThat(page.getNextEventId()).isEqualTo(500L);
        verify(domainEventRepository, never()).listAfterEventId(eq(10L), eq(100L), anyInt());
    }

    @Test
    void listAfterReturnsRetainedEventsInOrder() {
        DomainEventEntity first = event(501L, "artifact.version.created");
        DomainEventEntity second = event(502L, "run.event.appended");
        when(domainEventRepository.firstRetainedEventId(eq(10L), any(LocalDateTime.class))).thenReturn(500L);
        when(domainEventRepository.listAfterEventId(10L, 500L, 100)).thenReturn(Arrays.asList(first, second));

        EventPageVO page = domainEventService.listAfter(10L, 500L);

        assertThat(page.isRefreshRequired()).isFalse();
        assertThat(page.getEvents()).extracting("eventId").containsExactly(501L, 502L);
        assertThat(page.getNextEventId()).isEqualTo(502L);
    }

    private DomainEventEntity event(Long eventId, String type) {
        DomainEventEntity event = new DomainEventEntity();
        event.setId(eventId);
        event.setProjectId(10L);
        event.setEventId(eventId);
        event.setEventType(type);
        event.setAggregateType("REQUIREMENT");
        event.setAggregateId(100L);
        event.setPayloadJson("{\"requirementPk\":100}");
        return event;
    }
}
