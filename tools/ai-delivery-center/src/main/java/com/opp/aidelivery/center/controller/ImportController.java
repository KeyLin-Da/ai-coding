package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.ImportRecordsRequest;
import com.opp.aidelivery.center.model.dto.ImportSessionCreateRequest;
import com.opp.aidelivery.center.model.vo.ImportRecordsResultVO;
import com.opp.aidelivery.center.model.vo.ImportSessionVO;
import com.opp.aidelivery.center.service.ImportService;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery")
public class ImportController {

    private final ImportService importService;

    @PostMapping("/import-sessions")
    public ApiResponse<ImportSessionVO> createSession(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody ImportSessionCreateRequest request
    ) {
        return ApiResponse.ok(importService.createSession(userId, request));
    }

    @PostMapping("/import-sessions/{sessionId}/records")
    public ApiResponse<ImportRecordsResultVO> importRecords(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long sessionId,
        @Valid @RequestBody ImportRecordsRequest request
    ) {
        return ApiResponse.ok(importService.importRecords(userId, sessionId, request));
    }

    @GetMapping("/import-sessions/{sessionId}")
    public ApiResponse<ImportSessionVO> getSession(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long sessionId
    ) {
        return ApiResponse.ok(importService.getSession(userId, sessionId));
    }

    @PostMapping("/import-sessions/{sessionId}/complete")
    public ApiResponse<ImportSessionVO> completeSession(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long sessionId
    ) {
        return ApiResponse.ok(importService.completeSession(userId, sessionId));
    }
}
