package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ArtifactVersionVO {

    private Long id;
    private Long artifactId;
    private Integer versionNo;
    private Long baseVersionId;
    private Long fileObjectId;
    private String status;
    private Long sourceRunId;
    private Long createdBy;
    private LocalDateTime createdAt;
    private String sha256;
    private Long size;
    private String contentType;
}
