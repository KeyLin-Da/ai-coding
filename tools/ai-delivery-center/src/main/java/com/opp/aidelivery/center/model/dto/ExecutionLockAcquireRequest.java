package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ExecutionLockAcquireRequest {

    @NotNull
    private Long requirementPk;

    @NotBlank
    private String stage;

    @NotBlank
    private String actionType;

    @NotNull
    private Long clientSessionId;
}
