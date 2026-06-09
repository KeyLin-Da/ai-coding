package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.CollabDocumentOpenRequest;
import com.opp.aidelivery.center.model.dto.CollabOperationCreateRequest;
import com.opp.aidelivery.center.model.dto.CollabSnapshotCreateRequest;
import com.opp.aidelivery.center.model.vo.CollabDocumentVO;
import com.opp.aidelivery.center.model.vo.CollabOperationVO;
import com.opp.aidelivery.center.model.vo.CollabSnapshotVO;
import com.opp.aidelivery.center.service.CollabDocumentService;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery/collab-documents")
public class CollabDocumentController {

    private final CollabDocumentService collabDocumentService;

    @PostMapping("/open")
    public ApiResponse<CollabDocumentVO> openDraft(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody CollabDocumentOpenRequest request
    ) {
        return ApiResponse.ok(collabDocumentService.openDraft(userId, request));
    }

    @PostMapping("/operations")
    public ApiResponse<CollabOperationVO> appendOperation(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody CollabOperationCreateRequest request
    ) {
        return ApiResponse.ok(collabDocumentService.appendOperation(userId, request));
    }

    @PostMapping("/snapshots")
    public ApiResponse<CollabSnapshotVO> saveSnapshot(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody CollabSnapshotCreateRequest request
    ) {
        return ApiResponse.ok(collabDocumentService.saveSnapshot(userId, request));
    }
}
