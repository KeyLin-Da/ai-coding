package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_tech_design_annotation_reply")
@EqualsAndHashCode(callSuper = true)
public class TechDesignAnnotationReplyEntity extends BaseEntity {

    private Long requirementPk;
    private String annotationUid;
    private String replyUid;
    private String contentText;
    private LocalDateTime consumedAt;
    private String consumedRunId;
    private Long createdBy;
    private Long updatedBy;
}
