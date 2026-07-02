package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_user")
@EqualsAndHashCode(callSuper = true)
public class UserEntity extends BaseEntity {

    private String account;
    private String displayName;
    private String avatarUrl;
    private String status;
}
