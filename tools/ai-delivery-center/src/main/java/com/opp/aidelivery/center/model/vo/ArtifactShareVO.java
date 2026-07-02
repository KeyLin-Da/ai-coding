package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ArtifactShareVO {

    private Long id;
    private Long projectId;
    private Long requirementPk;
    private String requirementId;
    private String artifactPath;
    private String visibility;
    private String status;
    private LocalDateTime expireAt;
    private Boolean showAnnotations;
    private Boolean allowDownload;
    private Long accessCount;
    private LocalDateTime lastAccessAt;
    private Long createdBy;
    private LocalDateTime revokedAt;
    private LocalDateTime createdAt;
    private String token;
}
