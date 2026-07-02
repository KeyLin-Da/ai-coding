package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_review")
@EqualsAndHashCode(callSuper = true)
public class ReviewEntity extends BaseEntity {

    private Long requirementPk;
    private String stage;
    private String implementationStep;
    private String decision;
    private String comment;
    private Long actorId;
    private Long artifactVersionId;
}
