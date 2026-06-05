package com.opp.aidelivery.center.repository;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.mapper.DomainEventMapper;
import com.opp.aidelivery.center.model.entity.DomainEventEntity;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class DomainEventRepository {

    private final DomainEventMapper domainEventMapper;

    public DomainEventEntity save(DomainEventEntity event) {
        domainEventMapper.insert(event);
        return event;
    }

    public List<DomainEventEntity> listAfterEventId(Long projectId, long afterEventId, int limit) {
        return domainEventMapper.selectList(new LambdaQueryWrapper<DomainEventEntity>()
            .eq(DomainEventEntity::getProjectId, projectId)
            .gt(DomainEventEntity::getEventId, afterEventId)
            .orderByAsc(DomainEventEntity::getEventId)
            .last("LIMIT " + limit));
    }

    public Long firstRetainedEventId(Long projectId, LocalDateTime retainedSince) {
        DomainEventEntity event = domainEventMapper.selectOne(new LambdaQueryWrapper<DomainEventEntity>()
            .eq(DomainEventEntity::getProjectId, projectId)
            .ge(DomainEventEntity::getCreatedAt, retainedSince)
            .orderByAsc(DomainEventEntity::getEventId)
            .last("LIMIT 1"));
        return event == null ? null : event.getEventId();
    }
}
