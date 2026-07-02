package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_tech_design_annotation")
@EqualsAndHashCode(callSuper = true)
public class TechDesignAnnotationEntity extends BaseEntity {

    private Long requirementPk;
    private String annotationUid;
    private String artifactPath;
    private String versionId;
    private Integer versionNo;
    private String versionSource;
    private String contentHash;
    private String selectedText;
    private String commentText;
    private Integer plainStart;
    private Integer plainEnd;
    private String prefixText;
    private String suffixText;
    private String headingPathJson;
    private Integer occurrence;
    private String status;
    private Integer includeInNextGeneration;
    private LocalDateTime consumedAt;
    private String consumedRunId;
    private Long createdBy;
    private Long updatedBy;
}
