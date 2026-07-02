package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class RunEventVO {

    private Long id;
    private Long runId;
    private Long seq;
    private String level;
    private String type;
    private String message;
    private String payloadJson;
    private LocalDateTime createdAt;
}
