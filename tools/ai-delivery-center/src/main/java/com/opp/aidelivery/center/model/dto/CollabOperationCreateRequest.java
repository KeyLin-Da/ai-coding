package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CollabOperationCreateRequest {

    @NotNull
    private Long documentId;

    @NotNull
    private Long seq;

    @NotBlank
    private String operationType;

    @NotBlank
    private String operationPayload;
}
