package com.opp.aidelivery.center.config;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.RunMapper;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.RunEntity;
import com.opp.aidelivery.center.service.PermissionService;
import com.opp.aidelivery.center.service.WsSessionService;
import com.opp.aidelivery.center.service.WsTicketService;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class WsAuthenticationChannelInterceptor implements ChannelInterceptor {

    private final WsTicketService wsTicketService;
    private final WsSessionService wsSessionService;
    private final PermissionService permissionService;
    private final RequirementMapper requirementMapper;
    private final RunMapper runMapper;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }
        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            authenticate(accessor);
            return message;
        }
        if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            authorizeSubscribe(accessor);
            return message;
        }
        if (StompCommand.DISCONNECT.equals(accessor.getCommand())) {
            wsSessionService.disconnect(accessor.getSessionId());
            return message;
        }
        return message;
    }

    private void authenticate(StompHeaderAccessor accessor) {
        String ticket = accessor.getFirstNativeHeader("ticket");
        WsTicketService.TicketClaims claims = wsTicketService.validate(ticket);
        accessor.setUser(new WebSocketPrincipal(claims.getUserId(), claims.getClientSessionId()));
        wsSessionService.connect(accessor.getSessionId(), claims.getUserId(), claims.getClientSessionId());
    }

    private void authorizeSubscribe(StompHeaderAccessor accessor) {
        WebSocketPrincipal principal = principal(accessor);
        String destination = accessor.getDestination();
        if (destination == null || destination.startsWith("/user/")) {
            return;
        }
        if (destination.startsWith("/topic/projects/")) {
            Long projectId = segmentAsLong(destination, 3);
            permissionService.assertProjectMember(principal.getUserId(), projectId);
            return;
        }
        if (destination.startsWith("/topic/requirements/")) {
            Long requirementPk = segmentAsLong(destination, 3);
            RequirementEntity requirement = requirementMapper.selectById(requirementPk);
            if (requirement == null) {
                throw new BusinessException(AiDeliveryErrorCode.WEBSOCKET_SUBSCRIBE_DENIED, "需求不存在");
            }
            permissionService.assertProjectMember(principal.getUserId(), requirement.getProjectId());
            return;
        }
        if (destination.startsWith("/topic/runs/")) {
            Long runId = segmentAsLong(destination, 3);
            RunEntity run = runMapper.selectById(runId);
            if (run == null) {
                throw new BusinessException(AiDeliveryErrorCode.WEBSOCKET_SUBSCRIBE_DENIED, "运行记录不存在");
            }
            RequirementEntity requirement = requirementMapper.selectById(run.getRequirementPk());
            if (requirement == null) {
                throw new BusinessException(AiDeliveryErrorCode.WEBSOCKET_SUBSCRIBE_DENIED, "需求不存在");
            }
            permissionService.assertProjectMember(principal.getUserId(), requirement.getProjectId());
            return;
        }
        throw new BusinessException(AiDeliveryErrorCode.WEBSOCKET_SUBSCRIBE_DENIED);
    }

    private WebSocketPrincipal principal(StompHeaderAccessor accessor) {
        if (accessor.getUser() instanceof WebSocketPrincipal) {
            return (WebSocketPrincipal) accessor.getUser();
        }
        throw new BusinessException(AiDeliveryErrorCode.WEBSOCKET_TICKET_INVALID);
    }

    private Long segmentAsLong(String destination, int index) {
        String[] segments = destination.split("/");
        if (segments.length <= index) {
            throw new BusinessException(AiDeliveryErrorCode.WEBSOCKET_SUBSCRIBE_DENIED);
        }
        return Long.valueOf(segments[index]);
    }
}
