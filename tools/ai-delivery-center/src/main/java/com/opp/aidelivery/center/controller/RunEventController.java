package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
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
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

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
    public SseEmitter subscribe(
        @RequestHeader(value = "X-User-Id", required = false) Long userId,
        @PathVariable Long runId,
        @RequestParam(value = "userId", required = false) Long userIdParam
    ) {
        return runEventService.subscribe(resolveUserId(userId, userIdParam), runId);
    }

    private Long resolveUserId(Long headerUserId, Long queryUserId) {
        return headerUserId == null ? queryUserId : headerUserId;
    }
}
