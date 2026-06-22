package com.opp.aidelivery.center.model.dto;

import java.time.LocalDateTime;
import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class RunTokenUsageCreateRequest {

    @NotNull
    private Long runId;

    private Long seq;

    @Size(max = 32)
    private String stage;

    @Size(max = 64)
    private String implementationStep;

    @Size(max = 64)
    private String agentId;

    @Size(max = 128)
    private String model;

    @NotBlank
    @Size(max = 64)
    private String sourceEventType;

    @Size(max = 256)
    private String usageFingerprint;

    @Valid
    @NotNull
    private RunTokenUsageValueRequest usage;

    private String rawUsageJson;

    private LocalDateTime occurredAt;
}
