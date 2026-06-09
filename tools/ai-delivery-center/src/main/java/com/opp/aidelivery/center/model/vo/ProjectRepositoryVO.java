package com.opp.aidelivery.center.model.vo;

import lombok.Data;

@Data
public class ProjectRepositoryVO {

    private Long id;
    private Long projectId;
    private String provider;
    private String repoUrl;
    private String defaultBranch;
    private String repoCode;
    private String status;
}
