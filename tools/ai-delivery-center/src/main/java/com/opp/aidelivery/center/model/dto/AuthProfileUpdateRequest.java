package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class AuthProfileUpdateRequest {

    @NotBlank
    @Size(max = 128)
    private String displayName;

    @Size(max = 512)
    private String avatarUrl;
}
