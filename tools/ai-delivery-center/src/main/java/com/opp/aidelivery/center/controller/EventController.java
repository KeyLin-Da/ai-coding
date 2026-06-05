package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.vo.EventPageVO;
import com.opp.aidelivery.center.service.EventQueryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

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
    public SseEmitter subscribe(
        @RequestHeader(value = "X-User-Id", required = false) Long userId,
        @RequestParam Long projectId,
        @RequestParam(required = false) Long requirementPk,
        @RequestParam(value = "userId", required = false) Long userIdParam
    ) {
        return eventQueryService.subscribe(resolveUserId(userId, userIdParam), projectId, requirementPk);
    }

    private Long resolveUserId(Long headerUserId, Long queryUserId) {
        return headerUserId == null ? queryUserId : headerUserId;
    }
}
