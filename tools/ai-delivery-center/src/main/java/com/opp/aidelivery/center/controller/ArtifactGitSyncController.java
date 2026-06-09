package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.ArtifactGitSyncBlockedRequest;
import com.opp.aidelivery.center.model.dto.ArtifactGitSyncCompleteRequest;
import com.opp.aidelivery.center.model.vo.ArtifactGitSyncCompleteVO;
import com.opp.aidelivery.center.model.vo.ArtifactSyncVO;
import com.opp.aidelivery.center.security.CurrentUser;
import com.opp.aidelivery.center.service.ArtifactGitSyncService;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery/requirements/{requirementPk}/artifact-git-syncs")
public class ArtifactGitSyncController {

    private final ArtifactGitSyncService artifactGitSyncService;

    @PostMapping("/complete")
    public ApiResponse<ArtifactGitSyncCompleteVO> complete(
        @PathVariable Long requirementPk,
        @Valid @RequestBody ArtifactGitSyncCompleteRequest request
    ) {
        return ApiResponse.ok(artifactGitSyncService.complete(CurrentUser.id(), requirementPk, request));
    }

    @PostMapping("/blocked")
    public ApiResponse<ArtifactSyncVO> blocked(
        @PathVariable Long requirementPk,
        @Valid @RequestBody ArtifactGitSyncBlockedRequest request
    ) {
        return ApiResponse.ok(artifactGitSyncService.blocked(CurrentUser.id(), requirementPk, request));
    }
}
