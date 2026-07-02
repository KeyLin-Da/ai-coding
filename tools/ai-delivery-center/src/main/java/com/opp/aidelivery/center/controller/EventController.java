package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.model.vo.EventPageVO;
import com.opp.aidelivery.center.service.EventQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery/events")
public class EventController {

    private final EventQueryService eventQueryService;

    @GetMapping
    public ApiResponse<EventPageVO> listAfter(
        @RequestHeader("X-User-Id") Long userId,
        @RequestParam Long projectId,
        @RequestParam(defaultValue = "0") Long afterEventId
    ) {
        return ApiResponse.ok(eventQueryService.listAfter(userId, projectId, afterEventId));
    }

    @GetMapping("/subscribe")
    public ApiResponse<Void> subscribe() {
        throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "实时订阅已迁移到 WebSocket /api/ai-delivery/ws");
    }
}
