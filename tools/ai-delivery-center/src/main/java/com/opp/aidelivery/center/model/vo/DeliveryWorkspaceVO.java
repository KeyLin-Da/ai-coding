package com.opp.aidelivery.center.model.vo;

import lombok.Data;

@Data
public class DeliveryWorkspaceVO {

    private Long id;
    private Long projectId;
    private Long clientSessionId;
    private String localPath;
    private String status;
}
