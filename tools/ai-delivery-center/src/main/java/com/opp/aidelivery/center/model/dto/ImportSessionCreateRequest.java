package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ImportSessionCreateRequest {

    @NotNull
    private Long projectId;

    @Size(max = 32)
    private String mode = "IMPORT";

    @Size(max = 64)
    private String manifestSha256;

    private Boolean dryRun = false;

    @Size(max = 32)
    private String source = "LOCAL_BOOTSTRAP";
}
