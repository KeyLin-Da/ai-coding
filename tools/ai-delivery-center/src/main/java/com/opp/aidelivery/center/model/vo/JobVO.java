package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class JobVO {

    private Long id;
    private Long requirementPk;
    private String actionType;
    private String paramsJson;
    private String status;
    private Long claimedBy;
    private Long runId;
    private LocalDateTime leaseExpireAt;
    private Integer retryTimes;
    private Long createdBy;
}
