package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.ArtifactShareCreateRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationCreateRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationReplyRequest;
import com.opp.aidelivery.center.model.vo.ArtifactSharePublicVO;
import com.opp.aidelivery.center.model.vo.ArtifactShareVO;
import com.opp.aidelivery.center.model.vo.TechDesignAnnotationVO;
import com.opp.aidelivery.center.service.ArtifactShareService;
import com.opp.aidelivery.center.service.TechDesignAnnotationService;
import com.opp.aidelivery.center.security.CurrentUser;
import java.util.List;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery")
public class ArtifactShareController {

    private final ArtifactShareService artifactShareService;
    private final TechDesignAnnotationService techDesignAnnotationService;

    @PostMapping("/artifact-shares/public")
    public ApiResponse<ArtifactShareVO> createPublicShare(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody ArtifactShareCreateRequest request
    ) {
        return ApiResponse.ok(artifactShareService.createPublicShare(userId, request));
    }

    @GetMapping("/artifact-shares")
    public ApiResponse<List<ArtifactShareVO>> listPublicShares(
        @RequestHeader("X-User-Id") Long userId,
        @RequestParam Long projectId,
        @RequestParam(required = false) String requirementId,
        @RequestParam(required = false) String artifactPath
    ) {
        return ApiResponse.ok(artifactShareService.listPublicShares(userId, projectId, requirementId, artifactPath));
    }

    @PostMapping("/artifact-shares/{shareId}/revoke")
    public ApiResponse<ArtifactShareVO> revokePublicShare(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long shareId
    ) {
        return ApiResponse.ok(artifactShareService.revokePublicShare(userId, shareId));
    }

    @PostMapping("/artifact-shares/{shareId}/token/regenerate")
    public ApiResponse<ArtifactShareVO> regeneratePublicShareToken(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long shareId
    ) {
        return ApiResponse.ok(artifactShareService.regeneratePublicShareToken(userId, shareId));
    }

    @GetMapping("/public-artifact-shares/{token}")
    public ApiResponse<ArtifactSharePublicVO> resolvePublicShare(@PathVariable String token) {
        return ApiResponse.ok(artifactShareService.resolvePublicShare(token));
    }

    @GetMapping("/public-artifact-shares/{token}/tech-design-annotations")
    public ApiResponse<List<TechDesignAnnotationVO>> listPublicShareTechDesignAnnotations(
        @PathVariable String token,
        @RequestParam(required = false) String versionId
    ) {
        ArtifactSharePublicVO share = artifactShareService.resolvePublicShareForAnnotations(token);
        return ApiResponse.ok(techDesignAnnotationService.listPublic(share.getRequirementPk(), versionId));
    }

    @PostMapping("/public-artifact-shares/{token}/tech-design-annotations")
    public ApiResponse<List<TechDesignAnnotationVO>> createPublicShareTechDesignAnnotation(
        @PathVariable String token,
        @Valid @RequestBody TechDesignAnnotationCreateRequest request
    ) {
        ArtifactSharePublicVO share = artifactShareService.resolvePublicShareForAnnotations(token);
        return ApiResponse.ok(techDesignAnnotationService.createPublic(
            CurrentUser.id(),
            share.getRequirementPk(),
            share.getArtifactPath(),
            request
        ));
    }

    @PostMapping("/public-artifact-shares/{token}/tech-design-annotations/{annotationId}/delete")
    public ApiResponse<List<TechDesignAnnotationVO>> deletePublicShareTechDesignAnnotation(
        @PathVariable String token,
        @PathVariable String annotationId
    ) {
        ArtifactSharePublicVO share = artifactShareService.resolvePublicShareForAnnotations(token);
        return ApiResponse.ok(techDesignAnnotationService.deletePublic(
            CurrentUser.id(),
            share.getRequirementPk(),
            share.getArtifactPath(),
            annotationId
        ));
    }

    @PostMapping("/public-artifact-shares/{token}/tech-design-annotations/{annotationId}/replies")
    public ApiResponse<List<TechDesignAnnotationVO>> createPublicShareTechDesignAnnotationReply(
        @PathVariable String token,
        @PathVariable String annotationId,
        @Valid @RequestBody TechDesignAnnotationReplyRequest request
    ) {
        ArtifactSharePublicVO share = artifactShareService.resolvePublicShareForAnnotations(token);
        return ApiResponse.ok(techDesignAnnotationService.createPublicReply(
            CurrentUser.id(),
            share.getRequirementPk(),
            share.getArtifactPath(),
            annotationId,
            request
        ));
    }

    @PostMapping("/public-artifact-shares/{token}/tech-design-annotations/{annotationId}/replies/{replyId}/delete")
    public ApiResponse<List<TechDesignAnnotationVO>> deletePublicShareTechDesignAnnotationReply(
        @PathVariable String token,
        @PathVariable String annotationId,
        @PathVariable String replyId
    ) {
        ArtifactSharePublicVO share = artifactShareService.resolvePublicShareForAnnotations(token);
        return ApiResponse.ok(techDesignAnnotationService.deletePublicReply(
            CurrentUser.id(),
            share.getRequirementPk(),
            share.getArtifactPath(),
            annotationId,
            replyId
        ));
    }
}
