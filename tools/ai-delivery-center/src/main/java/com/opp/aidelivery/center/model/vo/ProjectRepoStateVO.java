package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ProjectRepoStateVO {

    private Long id;
    private Long projectId;
    private Long clientSessionId;
    private String localRepoPath;
    private String currentBranch;
    private String headCommit;
    private String remoteCommit;
    private String syncStatus;
    private LocalDateTime lastCheckedAt;
}
