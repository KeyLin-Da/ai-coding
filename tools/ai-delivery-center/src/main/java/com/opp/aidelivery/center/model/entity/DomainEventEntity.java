package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_domain_event")
@EqualsAndHashCode(callSuper = true)
public class DomainEventEntity extends BaseEntity {

    private Long projectId;
    private Long eventId;
    private String eventType;
    private String aggregateType;
    private Long aggregateId;
    private String payloadJson;
}
