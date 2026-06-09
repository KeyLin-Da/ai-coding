package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_import_session")
@EqualsAndHashCode(callSuper = true)
public class ImportSessionEntity extends BaseEntity {

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
}
