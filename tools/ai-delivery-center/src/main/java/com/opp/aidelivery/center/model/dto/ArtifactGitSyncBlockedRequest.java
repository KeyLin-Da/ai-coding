package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ArtifactGitSyncBlockedRequest {

    @NotBlank
    @Size(max = 32)
    private String stage;

    @NotBlank
    @Size(max = 32)
    private String syncType;

    @NotBlank
    @Size(max = 2000)
    private String errorMessage;
}
