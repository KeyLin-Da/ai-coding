package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class RequirementCreateRequest {

    @NotNull
    private Long projectId;

    @NotBlank
    @Size(max = 64)
    private String requirementId;

    @NotBlank
    @Size(max = 256)
    private String title;

    private String requirementType = "REQUIREMENT";

    @Size(max = 256)
    private String branchName;
}
