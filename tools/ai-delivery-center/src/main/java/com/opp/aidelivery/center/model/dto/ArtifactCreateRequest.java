package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ArtifactCreateRequest {

    @NotNull
    private Long requirementPk;

    @NotBlank
    @Size(max = 512)
    private String logicalPath;

    @NotBlank
    @Size(max = 256)
    private String label;

    @NotBlank
    @Size(max = 32)
    private String kind;

    @NotBlank
    @Size(max = 32)
    private String stage;
}
