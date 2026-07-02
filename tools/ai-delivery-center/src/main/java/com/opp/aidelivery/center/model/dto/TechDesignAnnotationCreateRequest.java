package com.opp.aidelivery.center.model.dto;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class TechDesignAnnotationCreateRequest {

    @NotBlank
    @Size(max = 512)
    private String artifactPath;

    @NotBlank
    @Size(max = 128)
    private String versionId;

    private Integer versionNo;

    @Size(max = 64)
    private String versionSource;

    @Size(max = 128)
    private String contentHash;

    @NotBlank
    @Size(max = 2000)
    private String selectedText;

    @NotBlank
    @Size(max = 4000)
    private String comment;

    private Boolean includeInNextGeneration = true;

    @Valid
    private TechDesignAnnotationAnchorRequest anchor = new TechDesignAnnotationAnchorRequest();
}
