package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_team")
@EqualsAndHashCode(callSuper = true)
public class TeamEntity extends BaseEntity {

    private String name;
    private String status;
}
