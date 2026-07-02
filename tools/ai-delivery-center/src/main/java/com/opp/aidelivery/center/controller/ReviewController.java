package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.ArtifactGitSyncCompleteRequest;
import com.opp.aidelivery.center.model.dto.StageReviewRequest;
import com.opp.aidelivery.center.model.entity.ReviewEntity;
import com.opp.aidelivery.center.model.vo.ArtifactGitSyncCompleteVO;
import com.opp.aidelivery.center.security.CurrentUser;
import com.opp.aidelivery.center.service.ArtifactGitSyncService;
import com.opp.aidelivery.center.service.ReviewService;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery/reviews")
public class ReviewController {

    private final ReviewService reviewService;
    private final ArtifactGitSyncService artifactGitSyncService;

    @PostMapping
    public ApiResponse<ReviewEntity> review(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody StageReviewRequest request
    ) {
        return ApiResponse.ok(reviewService.review(userId, request));
    }

    @PostMapping("/with-artifact-git-sync")
    public ApiResponse<ArtifactGitSyncCompleteVO> reviewWithArtifactGitSync(
        @Valid @RequestBody ArtifactGitSyncCompleteRequest request
    ) {
        return ApiResponse.ok(artifactGitSyncService.completeAndReview(CurrentUser.id(), request.getRequirementPk(), request));
    }
}
