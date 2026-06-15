package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ReviewVO {

    private Long id;
    private Long requirementPk;
    private String stage;
    private String implementationStep;
    private String decision;
    private String comment;
    private Long actorId;
    private Long artifactVersionId;
    private LocalDateTime createdAt;
}
