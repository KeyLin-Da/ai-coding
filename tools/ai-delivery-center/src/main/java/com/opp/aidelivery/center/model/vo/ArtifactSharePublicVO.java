package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ArtifactSharePublicVO {

    private Long id;
    private Long projectId;
    private Long requirementPk;
    private String requirementId;
    private String artifactPath;
    private String status;
    private LocalDateTime expireAt;
    private Boolean showAnnotations;
    private Boolean allowDownload;
    private String realtimeChannel;
}
