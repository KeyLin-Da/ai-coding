package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_artifact_sync")
@EqualsAndHashCode(callSuper = true)
public class ArtifactSyncEntity extends BaseEntity {

    private Long requirementPk;
    private String stage;
    private String syncType;
    private String status;
    private String commitSha;
    private Integer fileCount;
    private Long pushedBy;
    private LocalDateTime pushedAt;
    private String errorMessage;
}
