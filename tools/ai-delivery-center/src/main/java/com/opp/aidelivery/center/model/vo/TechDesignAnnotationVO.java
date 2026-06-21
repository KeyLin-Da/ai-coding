package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class TechDesignAnnotationVO {

    private String id;
    private Long requirementPk;
    private String artifactPath;
    private String versionId;
    private Integer versionNo;
    private String versionSource;
    private String contentHash;
    private String selectedText;
    private TechDesignAnnotationAnchorVO anchor;
    private String comment;
    private String status;
    private Boolean includeInNextGeneration;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Long createdBy;
    private String createdByName;
    private Long updatedBy;
    private String updatedByName;
    private LocalDateTime consumedAt;
    private String consumedRunId;
}
