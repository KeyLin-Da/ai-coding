package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_issue")
@EqualsAndHashCode(callSuper = true)
public class IssueEntity extends BaseEntity {

    private Long requirementPk;
    private String severity;
    private String status;
    private String title;
    private String recommendation;
    private Long sourceArtifactVersionId;
    private Long assigneeId;
}
