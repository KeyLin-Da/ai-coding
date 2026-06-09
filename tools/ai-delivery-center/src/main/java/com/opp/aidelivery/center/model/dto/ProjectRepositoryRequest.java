package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ProjectRepositoryRequest {

    @NotBlank
    @Size(max = 32)
    private String provider;

    @NotBlank
    @Size(max = 1024)
    private String repoUrl;

    @Size(max = 128)
    private String defaultBranch;
}
