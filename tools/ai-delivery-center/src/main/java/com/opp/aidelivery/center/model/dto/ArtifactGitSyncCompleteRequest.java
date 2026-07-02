package com.opp.aidelivery.center.model.dto;

import java.util.List;
import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotEmpty;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ArtifactGitSyncCompleteRequest {

    private Long requirementPk;

    @NotBlank
    @Size(max = 32)
    private String stage;

    @NotBlank
    @Size(max = 32)
    private String syncType;

    @NotBlank
    @Size(max = 40)
    private String commitSha;

    @Size(max = 40)
    private String baseCommitSha;

    private Long sourceRunId;

    @Valid
    @NotEmpty
    private List<ArtifactGitSyncFileRequest> files;

    @Valid
    private ArtifactGitSyncReviewRequest review;
}
