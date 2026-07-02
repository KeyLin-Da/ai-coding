package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ArtifactGitSyncReviewRequest {

    @NotBlank
    private String decision;

    @Size(max = 2000)
    private String comment;

    private String implementationStep;
}
