package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.RequirementWorkspaceStateReportRequest;
import com.opp.aidelivery.center.model.dto.RequirementWorkspaceWritableCheckRequest;
import com.opp.aidelivery.center.model.vo.RequirementWorkspaceStateVO;
import com.opp.aidelivery.center.security.CurrentUser;
import com.opp.aidelivery.center.service.RequirementWorkspaceStateService;
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
@RequestMapping("/api/ai-delivery/requirements/{requirementPk}/workspace-states")
public class RequirementWorkspaceStateController {

    private final RequirementWorkspaceStateService requirementWorkspaceStateService;

    @GetMapping
    public ApiResponse<List<RequirementWorkspaceStateVO>> listActive(@PathVariable Long requirementPk) {
        return ApiResponse.ok(requirementWorkspaceStateService.listActive(CurrentUser.id(), requirementPk));
    }

    @PostMapping("/report")
    public ApiResponse<RequirementWorkspaceStateVO> report(
        @PathVariable Long requirementPk,
        @Valid @RequestBody RequirementWorkspaceStateReportRequest request
    ) {
        return ApiResponse.ok(requirementWorkspaceStateService.report(CurrentUser.id(), requirementPk, request));
    }

    @PostMapping("/assert-writable")
    public ApiResponse<List<RequirementWorkspaceStateVO>> assertWritable(
        @PathVariable Long requirementPk,
        @Valid @RequestBody RequirementWorkspaceWritableCheckRequest request
    ) {
        return ApiResponse.ok(requirementWorkspaceStateService.assertWritable(CurrentUser.id(), requirementPk, request.getClientSessionId()));
    }
}
