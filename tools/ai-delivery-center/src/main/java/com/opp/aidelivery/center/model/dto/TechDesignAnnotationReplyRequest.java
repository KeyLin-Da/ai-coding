package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class TechDesignAnnotationReplyRequest {

    @NotBlank
    @Size(max = 4000)
    private String content;
}
