package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ArtifactGitSyncFileRequest {

    @NotBlank
    @Size(max = 512)
    private String path;

    @NotBlank
    @Size(max = 128)
    private String blobSha;

    @NotBlank
    @Size(max = 64)
    private String contentSha256;
}
