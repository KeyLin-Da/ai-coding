package com.opp.aidelivery.center.model.vo;

import lombok.Data;

@Data
public class WorkspaceMappingVO {

    private Long id;
    private Long projectId;
    private Long clientSessionId;
    private String localPath;
    private String displayName;
    private Boolean isDefault;
    private String status;
}
