package com.opp.aidelivery.center.model.dto;

import java.util.ArrayList;
import java.util.List;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ClientSessionRegisterRequest {

    @NotBlank
    @Size(max = 32)
    private String osType;

    private List<String> capabilities = new ArrayList<>();
}
