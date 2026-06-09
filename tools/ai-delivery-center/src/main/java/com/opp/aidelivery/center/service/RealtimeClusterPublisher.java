package com.opp.aidelivery.center.service;

import com.opp.aidelivery.center.model.entity.DomainEventEntity;
import com.opp.aidelivery.center.model.entity.RunEventEntity;

public interface RealtimeClusterPublisher {

    void publish(DomainEventEntity event);

    void publish(RunEventEntity event);
}
