package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CollabDocumentOpenRequest {

    @NotNull
    private Long artifactId;

    private Long baseVersionId;
}
