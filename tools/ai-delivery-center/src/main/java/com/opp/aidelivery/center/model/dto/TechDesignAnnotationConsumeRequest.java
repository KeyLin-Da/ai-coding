package com.opp.aidelivery.center.model.dto;

import java.util.List;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class TechDesignAnnotationConsumeRequest {

    @NotBlank
    @Size(max = 128)
    private String runId;

    @Size(max = 200)
    private List<@NotBlank @Size(max = 64) String> annotationIds;
}
