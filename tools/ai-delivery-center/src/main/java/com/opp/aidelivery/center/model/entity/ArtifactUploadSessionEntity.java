package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_artifact_upload_session")
@EqualsAndHashCode(callSuper = true)
public class ArtifactUploadSessionEntity extends BaseEntity {

    private Long artifactId;
    private Long baseVersionId;
    private String bucket;
    private String cosKey;
    private String fileName;
    private String expectedSha256;
    private Long expectedSize;
    private String contentType;
    private String status;
    private LocalDateTime expireAt;
    private Long createdBy;
}
