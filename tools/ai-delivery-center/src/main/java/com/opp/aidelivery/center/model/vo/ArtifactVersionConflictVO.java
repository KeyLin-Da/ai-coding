package com.opp.aidelivery.center.model.vo;

import lombok.Data;

@Data
public class ArtifactVersionConflictVO {

    private Long artifactId;
    private Long baseVersionId;
    private Long currentVersionId;
    private ArtifactVersionVO currentVersion;
}
