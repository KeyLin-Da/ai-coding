package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.IssueCreateRequest;
import com.opp.aidelivery.center.model.dto.IssueStatusUpdateRequest;
import com.opp.aidelivery.center.model.vo.IssueVO;
import com.opp.aidelivery.center.service.IssueService;
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
@RequestMapping("/api/ai-delivery/issues")
public class IssueController {

    private final IssueService issueService;

    @PostMapping
    public ApiResponse<IssueVO> create(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody IssueCreateRequest request
    ) {
        return ApiResponse.ok(issueService.create(userId, request));
    }

    @PostMapping("/{issueId}/status")
    public ApiResponse<IssueVO> updateStatus(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long issueId,
        @Valid @RequestBody IssueStatusUpdateRequest request
    ) {
        return ApiResponse.ok(issueService.updateStatus(userId, issueId, request));
    }
}
