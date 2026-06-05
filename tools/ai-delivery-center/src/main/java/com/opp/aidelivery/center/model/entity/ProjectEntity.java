package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_project")
@EqualsAndHashCode(callSuper = true)
public class ProjectEntity extends BaseEntity {

    private Long teamId;
    private String name;
    private String code;
    private String status;
}
