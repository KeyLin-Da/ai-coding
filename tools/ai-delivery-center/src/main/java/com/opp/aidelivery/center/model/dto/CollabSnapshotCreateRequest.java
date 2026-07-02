package com.opp.aidelivery.center.model.dto;

import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CollabSnapshotCreateRequest {

    @NotNull
    private Long documentId;

    @NotNull
    private Long seq;

    @NotBlank
    private String content;

    @NotBlank
    private String sha256;
}
