package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class CollabDocumentVO {

    private Long id;
    private Long artifactId;
    private Long baseVersionId;
    private String documentType;
    private String status;
    private Long version;
    private Long currentSnapshotId;
    private Long createdBy;
    private LocalDateTime createdAt;
}
