package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class JobCreateRequest {

    @NotNull
    private Long requirementPk;

    @NotBlank
    @Size(max = 64)
    private String actionType;

    private String paramsJson;
}
