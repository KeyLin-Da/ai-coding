package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.DeliveryWorkspaceSaveRequest;
import com.opp.aidelivery.center.model.dto.GitCredentialGenerateRequest;
import com.opp.aidelivery.center.model.vo.DeliveryWorkspaceVO;
import com.opp.aidelivery.center.model.vo.GitCredentialVO;
import com.opp.aidelivery.center.security.CurrentUser;
import com.opp.aidelivery.center.service.DeliveryWorkspaceService;
import com.opp.aidelivery.center.service.GitCredentialService;
import java.util.List;
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
@RequestMapping("/api/ai-delivery/users/me")
public class UserDeliveryWorkspaceController {

    private final DeliveryWorkspaceService deliveryWorkspaceService;
    private final GitCredentialService gitCredentialService;

    @GetMapping("/delivery-workspace")
    public ApiResponse<DeliveryWorkspaceVO> getDeliveryWorkspace(@RequestParam Long clientSessionId) {
        return ApiResponse.ok(deliveryWorkspaceService.get(CurrentUser.id(), clientSessionId));
    }

    @PostMapping("/delivery-workspace")
    public ApiResponse<DeliveryWorkspaceVO> saveDeliveryWorkspace(@Valid @RequestBody DeliveryWorkspaceSaveRequest request) {
        return ApiResponse.ok(deliveryWorkspaceService.save(CurrentUser.id(), request));
    }

    @GetMapping("/git-credentials")
    public ApiResponse<List<GitCredentialVO>> listGitCredentials() {
        return ApiResponse.ok(gitCredentialService.list(CurrentUser.id()));
    }

    @PostMapping("/git-credentials/generate")
    public ApiResponse<GitCredentialVO> generateGitCredential(@Valid @RequestBody GitCredentialGenerateRequest request) {
        return ApiResponse.ok(gitCredentialService.generate(CurrentUser.id(), request));
    }

    @PostMapping("/git-credentials/{credentialId}/regenerate")
    public ApiResponse<GitCredentialVO> regenerateGitCredential(
        @PathVariable Long credentialId,
        @Valid @RequestBody GitCredentialGenerateRequest request
    ) {
        return ApiResponse.ok(gitCredentialService.regenerate(CurrentUser.id(), credentialId, request));
    }
}
