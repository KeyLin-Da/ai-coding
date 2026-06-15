package com.opp.aidelivery.center.model.dto;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.NotNull;
import javax.validation.constraints.Size;
import lombok.Data;

@Data
public class ImportRecordsRequest {

    @Valid
    private List<RequirementImportRequest> requirements = new ArrayList<>();

    @Valid
    private List<StageImportRequest> stages = new ArrayList<>();

    @Valid
    private List<ReviewImportRequest> reviews = new ArrayList<>();

    @Valid
    private List<IssueImportRequest> issues = new ArrayList<>();

    @Valid
    private List<RunImportRequest> runs = new ArrayList<>();

    @Valid
    private List<RunEventImportRequest> runEvents = new ArrayList<>();

    @Valid
    private List<ArtifactImportRequest> artifacts = new ArrayList<>();

    @Data
    public static class RequirementImportRequest {
        @NotBlank
        @Size(max = 64)
        private String requirementId;

        @NotBlank
        @Size(max = 256)
        private String title;

        @Size(max = 32)
        private String requirementType = "REQUIREMENT";

        @Size(max = 256)
        private String branchName;

        @Size(max = 32)
        private String currentStage = "PRD";

        @Size(max = 32)
        private String status = "DRAFT";
    }

    @Data
    public static class StageImportRequest {
        @NotBlank
        @Size(max = 64)
        private String requirementId;

        @NotBlank
        @Size(max = 32)
        private String stage;

        @NotBlank
        @Size(max = 32)
        private String status;

        @Size(max = 512)
        private String artifactLogicalPath;

        private LocalDateTime approvedAt;
        private LocalDateTime rejectedAt;

        @Size(max = 1000)
        private String comment;
    }

    @Data
    public static class ReviewImportRequest {
        @NotBlank
        @Size(max = 512)
        private String sourceKey;

        @NotBlank
        @Size(max = 64)
        private String requirementId;

        @NotBlank
        @Size(max = 32)
        private String stage;

        @Size(max = 64)
        private String implementationStep;

        @NotBlank
        @Size(max = 32)
        private String decision;

        @Size(max = 2000)
        private String comment;

        private Long actorId;
        private Long artifactVersionId;
    }

    @Data
    public static class IssueImportRequest {
        @NotBlank
        @Size(max = 512)
        private String sourceKey;

        @NotBlank
        @Size(max = 64)
        private String requirementId;

        @NotBlank
        @Size(max = 32)
        private String severity;

        @Size(max = 32)
        private String status = "OPEN";

        @NotBlank
        @Size(max = 256)
        private String title;

        @Size(max = 2000)
        private String recommendation;

        private Long sourceArtifactVersionId;
        private Long assigneeId;
    }

    @Data
    public static class RunImportRequest {
        @NotBlank
        @Size(max = 512)
        private String sourceKey;

        @NotBlank
        @Size(max = 64)
        private String requirementId;

        @Size(max = 32)
        private String status = "SUCCEEDED";

        private Long jobId;
        private Long clientSessionId;

        @Size(max = 64)
        private String agentId;

        private LocalDateTime startedAt;
        private LocalDateTime finishedAt;

        @Size(max = 2000)
        private String errorMessage;
    }

    @Data
    public static class RunEventImportRequest {
        @NotBlank
        @Size(max = 512)
        private String sourceKey;

        @NotBlank
        @Size(max = 512)
        private String runSourceKey;

        @NotNull
        private Long seq;

        @NotBlank
        @Size(max = 16)
        private String level;

        @NotBlank
        @Size(max = 32)
        private String type;

        @NotNull
        private String message;

        private String payloadJson;
    }

    @Data
    public static class ArtifactImportRequest {
        @NotBlank
        @Size(max = 64)
        private String requirementId;

        @NotBlank
        @Size(max = 512)
        private String logicalPath;

        @NotBlank
        @Size(max = 256)
        private String label;

        @NotBlank
        @Size(max = 32)
        private String kind;

        @NotBlank
        @Size(max = 32)
        private String stage;

        @Size(min = 64, max = 64)
        private String sha256;

        private Long size;

        @Size(max = 128)
        private String contentType;
    }
}
