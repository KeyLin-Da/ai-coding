package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class IssueCreateRequest {

    @NotNull
    private Long requirementPk;

    @NotBlank
    private String severity;

    @NotBlank
    @Size(max = 256)
    private String title;

    @Size(max = 2000)
    private String recommendation;

    private Long sourceArtifactVersionId;

    private Long assigneeId;
}
