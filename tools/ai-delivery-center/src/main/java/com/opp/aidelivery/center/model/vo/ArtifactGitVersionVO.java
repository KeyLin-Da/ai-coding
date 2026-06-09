package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ArtifactGitVersionVO {

    private Long id;
    private Long artifactId;
    private Integer versionNo;
    private String commitSha;
    private String blobSha;
    private String contentSha256;
    private String filePath;
    private String baseCommitSha;
    private String status;
    private Long sourceRunId;
    private Long createdBy;
    private LocalDateTime createdAt;
}
