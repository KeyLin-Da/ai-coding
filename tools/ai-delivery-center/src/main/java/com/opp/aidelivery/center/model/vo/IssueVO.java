package com.opp.aidelivery.center.model.vo;

import lombok.Data;

@Data
public class IssueVO {

    private Long id;
    private Long requirementPk;
    private String severity;
    private String status;
    private String title;
    private String recommendation;
    private Long sourceArtifactVersionId;
    private Long assigneeId;
}
