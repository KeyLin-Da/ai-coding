package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class TechDesignAnnotationReplyVO {

    private String id;
    private String annotationId;
    private String content;
    private Long createdBy;
    private String createdByName;
    private Long updatedBy;
    private String updatedByName;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private LocalDateTime consumedAt;
    private String consumedRunId;
}
