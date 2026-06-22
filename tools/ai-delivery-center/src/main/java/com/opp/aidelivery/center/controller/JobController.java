package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.JobClaimRequest;
import com.opp.aidelivery.center.model.dto.JobCreateRequest;
import com.opp.aidelivery.center.model.dto.JobFailureRequest;
import com.opp.aidelivery.center.model.dto.JobLeaseRequest;
import com.opp.aidelivery.center.model.vo.JobVO;
import com.opp.aidelivery.center.service.JobService;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery/jobs")
public class JobController {

    private final JobService jobService;

    @PostMapping
    public ApiResponse<JobVO> create(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody JobCreateRequest request
    ) {
        return ApiResponse.ok(jobService.create(userId, request));
    }

    @PostMapping("/claim")
    public ApiResponse<JobVO> claim(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody JobClaimRequest request
    ) {
        return ApiResponse.ok(jobService.claim(userId, request));
    }

    @PostMapping("/{jobId}/claim")
    public ApiResponse<JobVO> claimById(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long jobId,
        @Valid @RequestBody JobClaimRequest request
    ) {
        return ApiResponse.ok(jobService.claimById(userId, jobId, request));
    }

    @PostMapping("/{jobId}/renew")
    public ApiResponse<JobVO> renew(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long jobId,
        @Valid @RequestBody JobLeaseRequest request
    ) {
        return ApiResponse.ok(jobService.renew(userId, jobId, request));
    }

    @PostMapping("/{jobId}/complete")
    public ApiResponse<JobVO> complete(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long jobId,
        @Valid @RequestBody JobLeaseRequest request
    ) {
        return ApiResponse.ok(jobService.complete(userId, jobId, request));
    }

    @PostMapping("/{jobId}/fail")
    public ApiResponse<JobVO> fail(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long jobId,
        @Valid @RequestBody JobFailureRequest request
    ) {
        return ApiResponse.ok(jobService.fail(userId, jobId, request));
    }

    @PostMapping("/{jobId}/cancel")
    public ApiResponse<JobVO> cancel(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long jobId
    ) {
        return ApiResponse.ok(jobService.cancel(userId, jobId));
    }
}
