package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.ProjectRepoStateUpdateRequest;
import com.opp.aidelivery.center.model.vo.ProjectRepoStateVO;
import com.opp.aidelivery.center.security.CurrentUser;
import com.opp.aidelivery.center.service.ProjectRepoStateService;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery/projects/{projectId}/repository-state")
public class ProjectRepositoryStateController {

    private final ProjectRepoStateService projectRepoStateService;

    @GetMapping
    public ApiResponse<ProjectRepoStateVO> get(
        @PathVariable Long projectId,
        @RequestParam Long clientSessionId
    ) {
        return ApiResponse.ok(projectRepoStateService.get(CurrentUser.id(), projectId, clientSessionId));
    }

    @PostMapping
    public ApiResponse<ProjectRepoStateVO> update(
        @PathVariable Long projectId,
        @Valid @RequestBody ProjectRepoStateUpdateRequest request
    ) {
        return ApiResponse.ok(projectRepoStateService.update(CurrentUser.id(), projectId, request));
    }
}
