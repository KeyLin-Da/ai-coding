package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class AuthLoginRequest {

    @NotBlank
    @Size(max = 128)
    private String account;
}
