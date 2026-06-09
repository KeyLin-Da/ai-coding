package com.opp.aidelivery.center.model.dto;

import lombok.Data;

@Data
public class RealtimeSubscribeRequest {

    private Long projectId;
    private Long requirementPk;
    private Long runId;
    private Long lastEventId;
    private Long afterSeq;
}
