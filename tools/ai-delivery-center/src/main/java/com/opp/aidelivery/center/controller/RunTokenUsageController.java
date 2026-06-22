package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.RunTokenUsageCreateRequest;
import com.opp.aidelivery.center.model.vo.RequirementTokenUsageSummaryVO;
import com.opp.aidelivery.center.model.vo.RunTokenUsageRunVO;
import com.opp.aidelivery.center.model.vo.RunTokenUsageSaveVO;
import com.opp.aidelivery.center.service.RunTokenUsageService;
import java.time.LocalDateTime;
import java.util.List;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
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
public class RunTokenUsageController {

    private final RunTokenUsageService runTokenUsageService;

    @PostMapping("/run-token-usages")
    public ApiResponse<RunTokenUsageSaveVO> append(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody RunTokenUsageCreateRequest request
    ) {
        return ApiResponse.ok(runTokenUsageService.append(userId, request));
    }

    @GetMapping("/runs/{runId}/token-usages")
    public ApiResponse<RunTokenUsageRunVO> listByRun(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long runId
    ) {
        return ApiResponse.ok(runTokenUsageService.listByRun(userId, runId));
    }

    @GetMapping("/requirements/{requirementPk}/token-usage-summary")
    public ApiResponse<RequirementTokenUsageSummaryVO> summarizeRequirement(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long requirementPk,
        @RequestParam(required = false) String stage,
        @RequestParam(required = false) String agentId,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime from,
        @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime to
    ) {
        return ApiResponse.ok(runTokenUsageService.summarizeRequirement(userId, requirementPk, stage, agentId, from, to));
    }

    @GetMapping("/projects/{projectId}/token-usage-summaries")
    public ApiResponse<List<RequirementTokenUsageSummaryVO>> summarizeProject(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long projectId
    ) {
        return ApiResponse.ok(runTokenUsageService.summarizeProject(userId, projectId));
    }
}
