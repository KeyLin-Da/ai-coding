package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class AuthRegisterRequest {

    @NotBlank
    @Size(max = 128)
    private String account;

    @NotBlank
    @Size(max = 128)
    private String displayName;
}
