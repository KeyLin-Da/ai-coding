package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.Valid;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ProjectCreateRequest {

    @NotBlank
    @Size(max = 128)
    private String name;

    @Valid
    @NotNull
    private ProjectRepositoryRequest repository;
}
