package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class RunEventCreateRequest {

    @NotNull
    private Long runId;

    private Long seq;

    @NotBlank
    @Size(max = 16)
    private String level;

    @NotBlank
    @Size(max = 32)
    private String type;

    @NotNull
    private String message;

    private String payloadJson;
}
