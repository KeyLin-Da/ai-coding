package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.PreflightRequest;
import com.opp.aidelivery.center.model.vo.PreflightResultVO;
import com.opp.aidelivery.center.service.PreflightService;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery")
public class PreflightController {

    private final PreflightService preflightService;

    @PostMapping("/preflight")
    public ApiResponse<PreflightResultVO> preflight(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody PreflightRequest request
    ) {
        return ApiResponse.ok(preflightService.check(userId, request));
    }
}
