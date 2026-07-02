package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ArtifactSyncVO {

    private Long id;
    private Long requirementPk;
    private String stage;
    private String syncType;
    private String status;
    private String commitSha;
    private Integer fileCount;
    private Long pushedBy;
    private LocalDateTime pushedAt;
    private String errorMessage;
}
