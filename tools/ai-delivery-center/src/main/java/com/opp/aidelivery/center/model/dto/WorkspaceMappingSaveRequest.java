package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class WorkspaceMappingSaveRequest {

    @NotBlank
    @Size(max = 1024)
    private String localPath;

    @Size(max = 128)
    private String displayName;

    private Long clientSessionId;
    private Boolean isDefault;
}
