package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_user_session")
@EqualsAndHashCode(callSuper = true)
public class UserSessionEntity extends BaseEntity {

    private Long userId;
    private String tokenHash;
    private String status;
    private LocalDateTime expireAt;
    private LocalDateTime lastAccessAt;
}
