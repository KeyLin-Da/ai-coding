package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class GitCredentialGenerateRequest {

    @NotBlank
    @Size(max = 32)
    private String platform;

    @NotBlank
    @Size(max = 128)
    private String fingerprint;

    @NotBlank
    @Size(max = 4096)
    private String publicKey;
}
