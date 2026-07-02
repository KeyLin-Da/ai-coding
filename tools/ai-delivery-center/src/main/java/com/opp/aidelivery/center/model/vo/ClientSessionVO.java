package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ClientSessionVO {

    private Long id;
    private Long userId;
    private String osType;
    private String capabilities;
    private String status;
    private LocalDateTime lastHeartbeatAt;
}
