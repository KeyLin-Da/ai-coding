package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ArtifactVersionVO {

    private Long id;
    private Long artifactId;
    private Integer versionNo;
    private String status;
    private Long sourceRunId;
    private Long createdBy;
    private LocalDateTime createdAt;
    private String sourceType;
    private String contentSha256;
    private String sha256;
    private String commitSha;
    private String blobSha;
    private String filePath;
    private String baseCommitSha;
}
