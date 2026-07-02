package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class CollabOperationVO {

    private Long id;
    private Long documentId;
    private Long seq;
    private Long actorId;
    private String operationType;
    private String operationPayload;
    private LocalDateTime createdAt;
}
