package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class WsTicketVO {

    private String ticket;
    private String wsUrl;
    private LocalDateTime expireAt;
}
