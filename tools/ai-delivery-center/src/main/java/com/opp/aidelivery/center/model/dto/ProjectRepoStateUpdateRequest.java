package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ProjectRepoStateUpdateRequest {

    @NotNull
    private Long clientSessionId;

    @NotBlank
    @Size(max = 1024)
    private String localRepoPath;

    @Size(max = 128)
    private String currentBranch;

    @Size(max = 40)
    private String headCommit;

    @Size(max = 40)
    private String remoteCommit;

    @NotBlank
    @Size(max = 32)
    private String syncStatus;
}
