package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_team_member")
@EqualsAndHashCode(callSuper = true)
public class TeamMemberEntity extends BaseEntity {

    private Long teamId;
    private Long userId;
    private String role;
}
