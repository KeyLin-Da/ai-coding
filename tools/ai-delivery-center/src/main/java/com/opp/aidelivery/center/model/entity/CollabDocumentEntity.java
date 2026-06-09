package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_collab_document")
@EqualsAndHashCode(callSuper = true)
public class CollabDocumentEntity extends BaseEntity {

    private Long artifactId;
    private Long baseVersionId;
    private String documentType;
    private String status;
    private Long version;
    private Long currentSnapshotId;
    private Long createdBy;
}
