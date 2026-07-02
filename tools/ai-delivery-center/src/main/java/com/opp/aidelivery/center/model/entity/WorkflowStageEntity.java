package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_workflow_stage")
@EqualsAndHashCode(callSuper = true)
public class WorkflowStageEntity extends BaseEntity {

    private Long requirementPk;
    private String stage;
    private String status;
    private Long artifactId;
    private LocalDateTime approvedAt;
    private LocalDateTime rejectedAt;
    private String comment;
    @Version
    private Long version;
}
