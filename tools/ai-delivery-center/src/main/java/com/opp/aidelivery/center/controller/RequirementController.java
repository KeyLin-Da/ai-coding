package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.RequirementCreateRequest;
import com.opp.aidelivery.center.model.vo.RequirementVO;
import com.opp.aidelivery.center.service.RequirementService;
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
@RequestMapping("/api/ai-delivery/requirements")
public class RequirementController {

    private final RequirementService requirementService;

    @PostMapping
    public ApiResponse<RequirementVO> create(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody RequirementCreateRequest request
    ) {
        return ApiResponse.ok(requirementService.create(userId, request));
    }

    @GetMapping
    public ApiResponse<List<RequirementVO>> list(
        @RequestHeader("X-User-Id") Long userId,
        @RequestParam Long projectId
    ) {
        return ApiResponse.ok(requirementService.list(userId, projectId));
    }

    @GetMapping("/{requirementId}")
    public ApiResponse<RequirementVO> get(
        @RequestHeader("X-User-Id") Long userId,
        @RequestParam Long projectId,
        @PathVariable String requirementId
    ) {
        return ApiResponse.ok(requirementService.get(userId, projectId, requirementId));
    }
}
