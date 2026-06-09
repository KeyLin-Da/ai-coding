package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.ProjectCreateRequest;
import com.opp.aidelivery.center.model.dto.ProjectJoinRequest;
import com.opp.aidelivery.center.model.dto.ProjectRepositoryRequest;
import com.opp.aidelivery.center.model.vo.ProjectVO;
import com.opp.aidelivery.center.security.CurrentUser;
import com.opp.aidelivery.center.service.ProjectService;
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
@RequestMapping("/api/ai-delivery/projects")
public class ProjectController {

    private final ProjectService projectService;

    @GetMapping("/my")
    public ApiResponse<List<ProjectVO>> listMyProjects() {
        return ApiResponse.ok(projectService.listMyProjects(CurrentUser.id()));
    }

    @PostMapping
    public ApiResponse<ProjectVO> create(@Valid @RequestBody ProjectCreateRequest request) {
        return ApiResponse.ok(projectService.create(CurrentUser.id(), request));
    }

    @PostMapping("/join")
    public ApiResponse<ProjectVO> join(@Valid @RequestBody ProjectJoinRequest request) {
        return ApiResponse.ok(projectService.join(CurrentUser.id(), request));
    }

    @PostMapping("/{projectId}/select")
    public ApiResponse<ProjectVO> select(@PathVariable Long projectId) {
        return ApiResponse.ok(projectService.select(CurrentUser.id(), projectId));
    }

    @PostMapping("/{projectId}/repository/bootstrap")
    public ApiResponse<ProjectVO> bootstrapRepository(
        @PathVariable Long projectId,
        @Valid @RequestBody ProjectRepositoryRequest request
    ) {
        return ApiResponse.ok(projectService.bootstrapRepository(CurrentUser.id(), projectId, request));
    }
}
