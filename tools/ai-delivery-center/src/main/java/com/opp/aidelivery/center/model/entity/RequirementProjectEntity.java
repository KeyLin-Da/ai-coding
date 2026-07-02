package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_requirement_project")
@EqualsAndHashCode(callSuper = true)
public class RequirementProjectEntity extends BaseEntity {

    private Long requirementPk;
    private String projectName;
}
