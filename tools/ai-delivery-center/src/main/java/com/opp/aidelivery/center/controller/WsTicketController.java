package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.WsTicketCreateRequest;
import com.opp.aidelivery.center.model.vo.WsTicketVO;
import com.opp.aidelivery.center.service.WsTicketService;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery/ws-tickets")
public class WsTicketController {

    private final WsTicketService wsTicketService;

    @PostMapping
    public ApiResponse<WsTicketVO> create(
        @RequestHeader("X-User-Id") Long userId,
        @Valid @RequestBody WsTicketCreateRequest request
    ) {
        return ApiResponse.ok(wsTicketService.createTicket(userId, request));
    }
}
