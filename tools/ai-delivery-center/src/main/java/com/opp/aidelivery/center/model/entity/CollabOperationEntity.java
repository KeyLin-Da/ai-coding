package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_collab_operation")
@EqualsAndHashCode(callSuper = true)
public class CollabOperationEntity extends BaseEntity {

    private Long documentId;
    private Long seq;
    private Long actorId;
    private String operationType;
    private String operationPayload;
}
