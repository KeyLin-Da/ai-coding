package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ExecutionLockRenewRequest {

    @NotNull
    private Long lockId;

    @NotNull
    private Long clientSessionId;
}
