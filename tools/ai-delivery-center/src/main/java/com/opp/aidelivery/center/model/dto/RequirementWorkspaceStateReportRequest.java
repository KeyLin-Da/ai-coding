package com.opp.aidelivery.center.model.dto;

import java.util.ArrayList;
import java.util.List;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class RequirementWorkspaceStateReportRequest {

    @NotNull
    private Long clientSessionId;

    @NotBlank
    @Size(max = 32)
    private String status;

    private Integer dirtyFileCount;

    @Size(max = 20)
    private List<@Size(max = 512) String> dirtyPathsSample = new ArrayList<>();

    @Size(max = 40)
    private String headCommit;

    @Size(max = 40)
    private String remoteCommit;
}
