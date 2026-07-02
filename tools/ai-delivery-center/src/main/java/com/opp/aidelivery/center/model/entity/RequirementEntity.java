package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_requirement")
@EqualsAndHashCode(callSuper = true)
public class RequirementEntity extends BaseEntity {

    private Long projectId;
    private String requirementId;
    private String title;
    private String requirementType;
    private String branchName;
    private String status;
    private String currentStage;
    @Version
    private Long version;
    private Long createdBy;
}
