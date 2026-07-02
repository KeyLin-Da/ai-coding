package com.opp.aidelivery.center.model.vo;

import lombok.Data;

@Data
public class ArtifactVO {

    private Long id;
    private Long requirementPk;
    private String logicalPath;
    private String label;
    private String kind;
    private String stage;
    private Long currentVersionId;
    private Long version;
}
