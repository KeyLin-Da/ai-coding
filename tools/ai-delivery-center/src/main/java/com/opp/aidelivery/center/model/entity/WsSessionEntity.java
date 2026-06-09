package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_ws_session")
@EqualsAndHashCode(callSuper = true)
public class WsSessionEntity extends BaseEntity {

    private Long userId;
    private Long clientSessionId;
    private Long lastProjectId;
    private String sessionId;
    private LocalDateTime connectedAt;
    private LocalDateTime lastSeenAt;
    private Long lastAckEventId;
    private String status;
}
