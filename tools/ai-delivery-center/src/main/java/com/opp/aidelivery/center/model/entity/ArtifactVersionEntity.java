package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_artifact_version")
@EqualsAndHashCode(callSuper = true)
public class ArtifactVersionEntity extends BaseEntity {

    private Long artifactId;
    private Integer versionNo;
    private Long baseVersionId;
    private Long fileObjectId;
    private String contentSha256;
    private String status;
    private Long sourceRunId;
    private Long createdBy;
}
