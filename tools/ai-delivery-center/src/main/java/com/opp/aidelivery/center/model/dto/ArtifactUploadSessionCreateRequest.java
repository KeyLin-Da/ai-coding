package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ArtifactUploadSessionCreateRequest {

    @NotNull
    private Long artifactId;

    private Long baseVersionId;

    @NotBlank
    @Size(max = 256)
    private String fileName;

    @NotBlank
    @Size(min = 64, max = 64)
    private String sha256;

    @NotNull
    private Long size;

    @NotBlank
    @Size(max = 128)
    private String contentType;
}
