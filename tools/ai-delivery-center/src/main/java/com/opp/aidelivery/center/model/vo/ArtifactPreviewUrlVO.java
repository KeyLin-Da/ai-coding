package com.opp.aidelivery.center.model.vo;

import lombok.Data;

@Data
public class ArtifactPreviewUrlVO {

    private String sourceType;
    private String commitSha;
    private String filePath;
}
