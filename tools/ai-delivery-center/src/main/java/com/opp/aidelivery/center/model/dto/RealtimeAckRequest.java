package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotNull;
import lombok.Data;

@Data
public class RealtimeAckRequest {

    @NotNull
    private Long projectId;

    @NotNull
    private Long lastEventId;
}
