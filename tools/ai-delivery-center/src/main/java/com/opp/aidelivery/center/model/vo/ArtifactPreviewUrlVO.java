package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ArtifactPreviewUrlVO {

    private String previewUrl;
    private LocalDateTime expireAt;
    private String sourceType;
    private String commitSha;
    private String filePath;
}
