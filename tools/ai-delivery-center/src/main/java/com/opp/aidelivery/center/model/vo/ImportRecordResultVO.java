package com.opp.aidelivery.center.model.vo;

import lombok.Data;

@Data
public class ImportRecordResultVO {

    private String itemType;
    private String sourceKey;
    private String status;
    private String targetType;
    private Long targetId;
    private Long artifactId;
    private Long existingVersionId;
    private String message;
}
