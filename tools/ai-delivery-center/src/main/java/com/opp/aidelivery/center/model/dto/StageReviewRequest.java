package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class StageReviewRequest {

    @NotNull
    private Long requirementPk;

    @NotBlank
    private String stage;

    private String implementationStep;

    @NotBlank
    private String decision;

    @Size(max = 2000)
    private String comment;

    private Long artifactVersionId;
}
