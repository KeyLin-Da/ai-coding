package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_client_session")
@EqualsAndHashCode(callSuper = true)
public class ClientSessionEntity extends BaseEntity {

    private Long userId;
    private String osType;
    private String capabilities;
    private String status;
    private LocalDateTime lastHeartbeatAt;
}
