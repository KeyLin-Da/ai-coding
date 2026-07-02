package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class DeliveryWorkspaceSaveRequest {

    @NotBlank
    @Size(max = 1024)
    private String localPath;
}
