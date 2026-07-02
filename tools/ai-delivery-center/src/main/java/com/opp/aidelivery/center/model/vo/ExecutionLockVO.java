package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ExecutionLockVO {

    private Long id;
    private Long requirementPk;
    private String stage;
    private String actionType;
    private Long holderUserId;
    private Long clientSessionId;
    private LocalDateTime expireAt;
    private String status;
}
