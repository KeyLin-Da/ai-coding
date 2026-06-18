package com.opp.aidelivery.center.model.dto;

import java.time.LocalDateTime;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ArtifactShareCreateRequest {

    @NotNull
    private Long projectId;

    private Long requirementPk;

    @NotBlank
    @Size(max = 64)
    private String requirementId;

    @NotBlank
    @Size(max = 512)
    private String artifactPath;

    private LocalDateTime expireAt;

    private Boolean showAnnotations = true;

    private Boolean allowDownload = true;
}
