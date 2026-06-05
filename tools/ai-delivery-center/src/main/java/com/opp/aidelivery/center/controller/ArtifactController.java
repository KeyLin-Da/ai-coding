package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.ArtifactCreateRequest;
import com.opp.aidelivery.center.model.dto.ArtifactUploadSessionCreateRequest;
import com.opp.aidelivery.center.model.dto.ArtifactVersionCompleteRequest;
import com.opp.aidelivery.center.model.vo.ArtifactPreviewUrlVO;
import com.opp.aidelivery.center.model.vo.ArtifactUploadSessionVO;
import com.opp.aidelivery.center.model.vo.ArtifactVersionVO;
import com.opp.aidelivery.center.model.vo.ArtifactVO;
import com.opp.aidelivery.center.service.ArtifactService;
import java.util.List;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery")
public class ArtifactController {

    private final ArtifactService artifactService;

    @PostMapping("/artifacts")
    public ApiResponse<ArtifactVO> createArtifact(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody ArtifactCreateRequest request
    ) {
        return ApiResponse.ok(artifactService.createArtifact(userId, request));
    }

    @PostMapping("/artifact-upload-sessions")
    public ApiResponse<ArtifactUploadSessionVO> createUploadSession(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody ArtifactUploadSessionCreateRequest request
    ) {
        return ApiResponse.ok(artifactService.createUploadSession(userId, request));
    }

    @PostMapping("/artifact-versions/complete")
    public ApiResponse<ArtifactVersionVO> completeUpload(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody ArtifactVersionCompleteRequest request
    ) {
        return ApiResponse.ok(artifactService.completeUpload(userId, request));
    }

    @GetMapping("/artifacts/{artifactId}/versions")
    public ApiResponse<List<ArtifactVersionVO>> listVersions(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long artifactId
    ) {
        return ApiResponse.ok(artifactService.listVersions(userId, artifactId));
    }

    @GetMapping("/artifacts/{artifactId}/current-version")
    public ApiResponse<ArtifactVersionVO> currentVersion(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long artifactId
    ) {
        return ApiResponse.ok(artifactService.currentVersion(userId, artifactId));
    }

    @GetMapping("/artifacts/{artifactId}/versions/{versionId}/preview-url")
    public ApiResponse<ArtifactPreviewUrlVO> previewUrl(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long artifactId,
        @PathVariable Long versionId
    ) {
        return ApiResponse.ok(artifactService.previewUrl(userId, artifactId, versionId));
    }
}
