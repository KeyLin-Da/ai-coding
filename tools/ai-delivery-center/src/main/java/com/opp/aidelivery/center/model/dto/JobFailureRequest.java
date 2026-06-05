package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class JobFailureRequest {

    @NotNull
    private Long clientSessionId;

    @Size(max = 2000)
    private String errorMessage;
}
