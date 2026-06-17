package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationConsumeRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationCreateRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationStatusRequest;
import com.opp.aidelivery.center.model.vo.TechDesignAnnotationVO;
import com.opp.aidelivery.center.security.CurrentUser;
import com.opp.aidelivery.center.service.TechDesignAnnotationService;
import java.util.List;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery/requirements/{requirementPk}/tech-design-annotations")
public class TechDesignAnnotationController {

    private final TechDesignAnnotationService techDesignAnnotationService;

    @GetMapping
    public ApiResponse<List<TechDesignAnnotationVO>> list(
        @PathVariable Long requirementPk,
        @RequestParam(required = false) String versionId
    ) {
        return ApiResponse.ok(techDesignAnnotationService.list(CurrentUser.id(), requirementPk, versionId));
    }

    @GetMapping("/pending")
    public ApiResponse<List<TechDesignAnnotationVO>> listConsumable(@PathVariable Long requirementPk) {
        return ApiResponse.ok(techDesignAnnotationService.listConsumable(CurrentUser.id(), requirementPk));
    }

    @PostMapping
    public ApiResponse<List<TechDesignAnnotationVO>> create(
        @PathVariable Long requirementPk,
        @Valid @RequestBody TechDesignAnnotationCreateRequest request
    ) {
        return ApiResponse.ok(techDesignAnnotationService.create(CurrentUser.id(), requirementPk, request));
    }

    @PostMapping("/{annotationId}/status")
    public ApiResponse<List<TechDesignAnnotationVO>> updateStatus(
        @PathVariable Long requirementPk,
        @PathVariable String annotationId,
        @Valid @RequestBody TechDesignAnnotationStatusRequest request
    ) {
        return ApiResponse.ok(techDesignAnnotationService.updateStatus(CurrentUser.id(), requirementPk, annotationId, request));
    }

    @PostMapping("/{annotationId}/delete")
    public ApiResponse<List<TechDesignAnnotationVO>> delete(
        @PathVariable Long requirementPk,
        @PathVariable String annotationId
    ) {
        return ApiResponse.ok(techDesignAnnotationService.delete(CurrentUser.id(), requirementPk, annotationId));
    }

    @PostMapping("/consume")
    public ApiResponse<List<TechDesignAnnotationVO>> consume(
        @PathVariable Long requirementPk,
        @Valid @RequestBody TechDesignAnnotationConsumeRequest request
    ) {
        return ApiResponse.ok(techDesignAnnotationService.consume(CurrentUser.id(), requirementPk, request));
    }
}
