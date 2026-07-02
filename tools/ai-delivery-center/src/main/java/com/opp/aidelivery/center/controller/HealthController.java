package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.service.HealthService;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery")
public class HealthController {

    private final HealthService healthService;

    @GetMapping("/health")
    public ApiResponse<Map<String, Object>> health() {
        return ApiResponse.ok(healthService.health());
    }
}
