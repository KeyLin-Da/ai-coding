package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ArtifactVersionCompleteRequest {

    @NotNull
    private Long uploadSessionId;

    private Long baseVersionId;

    private Long sourceRunId;
}
