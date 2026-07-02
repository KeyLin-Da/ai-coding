package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class IssueStatusUpdateRequest {

    @NotBlank
    private String status;

    @Size(max = 2000)
    private String comment;
}
