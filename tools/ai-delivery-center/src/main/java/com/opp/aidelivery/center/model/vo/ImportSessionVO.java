package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ImportSessionVO {

    private Long id;
    private Long projectId;
    private String mode;
    private String status;
    private String source;
    private String manifestSha256;
    private Integer totalCount;
    private Integer importedCount;
    private Integer skippedCount;
    private Integer failedCount;
    private Integer duplicatedCount;
    private Integer conflictedCount;
    private String errorMessage;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
