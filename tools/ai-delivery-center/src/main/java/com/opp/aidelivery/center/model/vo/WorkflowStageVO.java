package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class WorkflowStageVO {

    private Long id;
    private String stage;
    private String status;
    private Long artifactId;
    private LocalDateTime approvedAt;
    private LocalDateTime rejectedAt;
    private String comment;
    private Long version;
}
