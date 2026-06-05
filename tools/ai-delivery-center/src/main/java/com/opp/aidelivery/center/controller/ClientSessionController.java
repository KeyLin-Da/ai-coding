package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.ClientSessionHeartbeatRequest;
import com.opp.aidelivery.center.model.dto.ClientSessionRegisterRequest;
import com.opp.aidelivery.center.model.vo.ClientSessionVO;
import com.opp.aidelivery.center.service.ClientSessionService;
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
@RequestMapping("/api/ai-delivery/client-sessions")
public class ClientSessionController {

    private final ClientSessionService clientSessionService;

    @PostMapping
    public ApiResponse<ClientSessionVO> register(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody ClientSessionRegisterRequest request
    ) {
        return ApiResponse.ok(clientSessionService.register(userId, request));
    }

    @PostMapping("/{clientSessionId}/heartbeat")
    public ApiResponse<ClientSessionVO> heartbeat(
        @RequestHeader("X-User-Id") Long userId,
        @PathVariable Long clientSessionId,
        @Valid @RequestBody ClientSessionHeartbeatRequest request
    ) {
        return ApiResponse.ok(clientSessionService.heartbeat(userId, clientSessionId, request));
    }
}
