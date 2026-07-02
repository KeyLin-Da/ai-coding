package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.WebSocketPrincipal;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.RunMapper;
import com.opp.aidelivery.center.model.dto.PresenceHeartbeatRequest;
import com.opp.aidelivery.center.model.dto.RealtimeAckRequest;
import com.opp.aidelivery.center.model.dto.RealtimeSubscribeRequest;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.RunEntity;
import com.opp.aidelivery.center.model.vo.EventPageVO;
import com.opp.aidelivery.center.model.vo.RunEventVO;
import com.opp.aidelivery.center.service.EventQueryService;
import com.opp.aidelivery.center.service.RunEventService;
import com.opp.aidelivery.center.service.WsSessionService;
import java.security.Principal;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
@RequiredArgsConstructor
public class RealtimeWebSocketController {

    private final EventQueryService eventQueryService;
    private final RunEventService runEventService;
    private final RequirementMapper requirementMapper;
    private final RunMapper runMapper;
    private final WsSessionService wsSessionService;
    private final SimpMessagingTemplate messagingTemplate;

    @MessageMapping("/projects/{projectId}/subscribe")
    public void subscribeProject(
        @DestinationVariable Long projectId,
        RealtimeSubscribeRequest request,
        Principal principal
    ) {
        WebSocketPrincipal user = principal(principal);
        Long requirementPk = request == null ? null : request.getRequirementPk();
        Long lastEventId = request == null || request.getLastEventId() == null ? 0L : request.getLastEventId();
        eventQueryService.assertSubscription(user.getUserId(), projectId, requirementPk);
        EventPageVO page = eventQueryService.listAfter(user.getUserId(), projectId, requirementPk, lastEventId);
        sendToUser(user, "/queue/events", page);
    }

    @MessageMapping("/requirements/{requirementPk}/subscribe")
    public void subscribeRequirement(
        @DestinationVariable Long requirementPk,
        RealtimeSubscribeRequest request,
        Principal principal
    ) {
        RequirementEntity requirement = requirementMapper.selectById(requirementPk);
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        RealtimeSubscribeRequest subscribe = request == null ? new RealtimeSubscribeRequest() : request;
        subscribe.setRequirementPk(requirementPk);
        subscribeProject(requirement.getProjectId(), subscribe, principal);
    }

    @MessageMapping("/runs/{runId}/subscribe")
    public void subscribeRun(
        @DestinationVariable Long runId,
        RealtimeSubscribeRequest request,
        Principal principal
    ) {
        WebSocketPrincipal user = principal(principal);
        RunEntity run = runMapper.selectById(runId);
        if (run == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "运行记录不存在");
        }
        long afterSeq = request == null || request.getAfterSeq() == null ? 0L : request.getAfterSeq();
        List<RunEventVO> events = runEventService.listAfter(user.getUserId(), runId, afterSeq);
        sendToUser(user, "/queue/run-events", events);
    }

    @MessageMapping("/events/ack")
    public void ack(RealtimeAckRequest request, Principal principal, SimpMessageHeaderAccessor accessor) {
        principal(principal);
        if (request == null || request.getLastEventId() == null) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "缺少 lastEventId");
        }
        wsSessionService.ack(accessor.getSessionId(), request.getLastEventId());
    }

    @MessageMapping("/presence/heartbeat")
    public void heartbeat(PresenceHeartbeatRequest request, Principal principal, SimpMessageHeaderAccessor accessor) {
        principal(principal);
        wsSessionService.heartbeat(accessor.getSessionId(), request == null ? null : request.getProjectId());
    }

    private WebSocketPrincipal principal(Principal principal) {
        if (principal instanceof WebSocketPrincipal) {
            return (WebSocketPrincipal) principal;
        }
        throw new BusinessException(AiDeliveryErrorCode.WEBSOCKET_TICKET_INVALID);
    }

    private void sendToUser(WebSocketPrincipal user, String destination, Object payload) {
        messagingTemplate.convertAndSendToUser(user.getName(), destination, payload);
    }
}
