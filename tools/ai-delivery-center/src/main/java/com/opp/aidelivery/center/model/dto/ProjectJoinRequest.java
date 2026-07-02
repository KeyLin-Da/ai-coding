package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ProjectJoinRequest {

    @NotBlank
    @Size(max = 128)
    private String code;
}
