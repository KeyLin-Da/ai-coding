package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class RequirementWorkspaceStateVO {

    private Long id;
    private Long projectId;
    private Long requirementPk;
    private Long userId;
    private String userDisplayName;
    private Long clientSessionId;
    private String status;
    private Integer dirtyFileCount;
    private List<String> dirtyPathsSample = new ArrayList<>();
    private String headCommit;
    private String remoteCommit;
    private LocalDateTime firstDirtyAt;
    private LocalDateTime lastReportedAt;
    private LocalDateTime expireAt;
}
