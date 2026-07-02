package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_collab_snapshot")
@EqualsAndHashCode(callSuper = true)
public class CollabSnapshotEntity extends BaseEntity {

    private Long documentId;
    private Long seq;
    private String content;
    private String sha256;
}
