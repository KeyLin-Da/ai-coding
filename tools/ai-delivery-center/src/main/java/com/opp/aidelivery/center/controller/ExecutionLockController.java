package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.ExecutionLockAcquireRequest;
import com.opp.aidelivery.center.model.dto.ExecutionLockReleaseRequest;
import com.opp.aidelivery.center.model.dto.ExecutionLockRenewRequest;
import com.opp.aidelivery.center.model.vo.ExecutionLockVO;
import com.opp.aidelivery.center.service.ExecutionLockService;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery/execution-locks")
public class ExecutionLockController {

    private final ExecutionLockService executionLockService;

    @PostMapping("/acquire")
    public ApiResponse<ExecutionLockVO> acquire(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody ExecutionLockAcquireRequest request
    ) {
        return ApiResponse.ok(executionLockService.acquire(userId, request));
    }

    @PostMapping("/renew")
    public ApiResponse<ExecutionLockVO> renew(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody ExecutionLockRenewRequest request
    ) {
        return ApiResponse.ok(executionLockService.renew(userId, request));
    }

    @PostMapping("/release")
    public ApiResponse<ExecutionLockVO> release(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody ExecutionLockReleaseRequest request
    ) {
        return ApiResponse.ok(executionLockService.release(userId, request));
    }
}
