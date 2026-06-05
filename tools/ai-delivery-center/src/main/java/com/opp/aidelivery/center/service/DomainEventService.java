package com.opp.aidelivery.center.service;

import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.model.entity.DomainEventEntity;
import com.opp.aidelivery.center.model.vo.DomainEventVO;
import com.opp.aidelivery.center.model.vo.EventPageVO;
import com.opp.aidelivery.center.repository.DomainEventRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@RequiredArgsConstructor
public class DomainEventService {

    private final AtomicLong eventSequence = new AtomicLong(System.currentTimeMillis());

    private final AiDeliveryCenterProperties properties;
    private final DomainEventRepository domainEventRepository;
    private final RealtimeEventBroker realtimeEventBroker;

    public void publishAfterCommit(
        Long projectId,
        String eventType,
        String aggregateType,
        Long aggregateId,
        String payloadJson
    ) {
        Runnable publisher = () -> publishNow(projectId, eventType, aggregateType, aggregateId, payloadJson);
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publisher.run();
                }
            });
            return;
        }
        publisher.run();
    }

    public DomainEventEntity publishNow(
        Long projectId,
        String eventType,
        String aggregateType,
        Long aggregateId,
        String payloadJson
    ) {
        DomainEventEntity event = new DomainEventEntity();
        event.setProjectId(projectId);
        event.setEventId(nextEventId());
        event.setEventType(eventType);
        event.setAggregateType(aggregateType);
        event.setAggregateId(aggregateId);
        event.setPayloadJson(payloadJson);
        domainEventRepository.save(event);
        realtimeEventBroker.broadcast(event);
        return event;
    }

    public EventPageVO listAfter(Long projectId, long afterEventId) {
        EventPageVO page = new EventPageVO();
        LocalDateTime retainedSince = LocalDateTime.now().minus(properties.getEvent().getRetainedWindow());
        Long firstRetainedEventId = domainEventRepository.firstRetainedEventId(projectId, retainedSince);
        if (afterEventId > 0 && firstRetainedEventId != null && afterEventId < firstRetainedEventId) {
            page.setRefreshRequired(true);
            page.setRefreshScope("PROJECT");
            page.setNextEventId(firstRetainedEventId);
            return page;
        }

        List<DomainEventEntity> events = domainEventRepository.listAfterEventId(projectId, afterEventId, properties.getEvent().getPageSize());
        page.setEvents(events.stream().map(this::toVO).collect(Collectors.toList()));
        page.setNextEventId(events.isEmpty() ? afterEventId : events.get(events.size() - 1).getEventId());
        return page;
    }

    public DomainEventVO toVO(DomainEventEntity event) {
        DomainEventVO vo = new DomainEventVO();
        vo.setId(event.getId());
        vo.setProjectId(event.getProjectId());
        vo.setEventId(event.getEventId());
        vo.setEventType(event.getEventType());
        vo.setAggregateType(event.getAggregateType());
        vo.setAggregateId(event.getAggregateId());
        vo.setPayloadJson(event.getPayloadJson());
        vo.setCreatedAt(event.getCreatedAt());
        return vo;
    }

    private long nextEventId() {
        return eventSequence.updateAndGet(previous -> Math.max(previous + 1, System.currentTimeMillis()));
    }
}
