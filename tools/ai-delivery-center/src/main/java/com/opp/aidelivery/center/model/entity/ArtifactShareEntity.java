package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_artifact_share")
@EqualsAndHashCode(callSuper = true)
public class ArtifactShareEntity extends BaseEntity {

    private Long projectId;
    private Long requirementPk;
    private String requirementId;
    private String artifactPath;
    private String visibility;
    private String tokenHash;
    private String status;
    private LocalDateTime expireAt;
    private Integer showAnnotations;
    private Integer allowDownload;
    private Long accessCount;
    private LocalDateTime lastAccessAt;
    private Long createdBy;
    private LocalDateTime revokedAt;
}
