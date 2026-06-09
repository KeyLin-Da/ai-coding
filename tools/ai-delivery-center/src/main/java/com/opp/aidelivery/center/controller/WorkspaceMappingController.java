package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.WorkspaceMappingSaveRequest;
import com.opp.aidelivery.center.model.vo.WorkspaceMappingVO;
import com.opp.aidelivery.center.security.CurrentUser;
import com.opp.aidelivery.center.service.WorkspaceMappingService;
import java.util.List;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery/projects/{projectId}/workspace-mappings")
public class WorkspaceMappingController {

    private final WorkspaceMappingService workspaceMappingService;

    @GetMapping
    public ApiResponse<List<WorkspaceMappingVO>> list(@PathVariable Long projectId) {
        return ApiResponse.ok(workspaceMappingService.list(CurrentUser.id(), projectId));
    }

    @PostMapping
    public ApiResponse<WorkspaceMappingVO> save(
        @PathVariable Long projectId,
        @Valid @RequestBody WorkspaceMappingSaveRequest request
    ) {
        return ApiResponse.ok(workspaceMappingService.save(CurrentUser.id(), projectId, request));
    }

    @PostMapping("/{mappingId}/disable")
    public ApiResponse<WorkspaceMappingVO> disable(
        @PathVariable Long projectId,
        @PathVariable Long mappingId
    ) {
        return ApiResponse.ok(workspaceMappingService.disable(CurrentUser.id(), projectId, mappingId));
    }
}
