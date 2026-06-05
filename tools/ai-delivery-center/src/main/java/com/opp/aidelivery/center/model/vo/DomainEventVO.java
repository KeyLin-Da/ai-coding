package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class DomainEventVO {

    private Long id;
    private Long projectId;
    private Long eventId;
    private String eventType;
    private String aggregateType;
    private Long aggregateId;
    private String payloadJson;
    private LocalDateTime createdAt;
}
