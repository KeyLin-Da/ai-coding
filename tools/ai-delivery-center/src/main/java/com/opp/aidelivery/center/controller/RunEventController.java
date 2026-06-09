package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.model.dto.RunEventCreateRequest;
import com.opp.aidelivery.center.model.vo.RunEventVO;
import com.opp.aidelivery.center.service.RunEventService;
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
public class RunEventController {

    private final RunEventService runEventService;

    @PostMapping("/run-events")
    public ApiResponse<RunEventVO> append(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody RunEventCreateRequest request
    ) {
        return ApiResponse.ok(runEventService.append(userId, request));
    }

    @GetMapping("/runs/{runId}/events")
    public ApiResponse<List<RunEventVO>> listAfter(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long runId,
        @RequestParam(defaultValue = "0") Long afterSeq
    ) {
        return ApiResponse.ok(runEventService.listAfter(userId, runId, afterSeq));
    }

    @GetMapping("/runs/{runId}/events/subscribe")
    public ApiResponse<Void> subscribe(@PathVariable Long runId) {
        throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "运行日志实时订阅已迁移到 WebSocket /api/ai-delivery/ws");
    }
}
