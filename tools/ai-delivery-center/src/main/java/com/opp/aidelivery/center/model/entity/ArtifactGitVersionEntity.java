package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_artifact_git_version")
@EqualsAndHashCode(callSuper = true)
public class ArtifactGitVersionEntity extends BaseEntity {

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
}
