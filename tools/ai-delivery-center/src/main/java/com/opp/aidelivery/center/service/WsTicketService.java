package com.opp.aidelivery.center.service;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.model.dto.WsTicketCreateRequest;
import com.opp.aidelivery.center.model.vo.WsTicketVO;
import java.time.LocalDateTime;
import java.util.Iterator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WsTicketService {

    private final AiDeliveryCenterProperties properties;
    private final ClientSessionService clientSessionService;
    private final Map<String, TicketClaims> tickets = new ConcurrentHashMap<>();

    public WsTicketVO createTicket(Long userId, WsTicketCreateRequest request) {
        clientSessionService.loadOwnedSession(userId, request.getClientSessionId());
        String ticket = UUID.randomUUID().toString().replace("-", "");
        LocalDateTime expireAt = LocalDateTime.now().plus(properties.getWebsocket().getTicketTtl());
        tickets.put(ticket, new TicketClaims(userId, request.getClientSessionId(), expireAt));

        WsTicketVO vo = new WsTicketVO();
        vo.setTicket(ticket);
        vo.setExpireAt(expireAt);
        vo.setWsUrl(properties.getWebsocket().getEndpoint());
        return vo;
    }

    public TicketClaims validate(String ticket) {
        if (ticket == null || ticket.trim().isEmpty()) {
            throw new BusinessException(AiDeliveryErrorCode.WEBSOCKET_TICKET_INVALID);
        }
        TicketClaims claims = tickets.get(ticket);
        if (claims == null || claims.isExpired()) {
            tickets.remove(ticket);
            throw new BusinessException(AiDeliveryErrorCode.WEBSOCKET_TICKET_INVALID);
        }
        return claims;
    }

    @Scheduled(fixedDelay = 60000)
    public void cleanupExpiredTickets() {
        Iterator<Map.Entry<String, TicketClaims>> iterator = tickets.entrySet().iterator();
        while (iterator.hasNext()) {
            if (iterator.next().getValue().isExpired()) {
                iterator.remove();
            }
        }
    }

    @Getter
    public static class TicketClaims {

        private final Long userId;
        private final Long clientSessionId;
        private final LocalDateTime expireAt;

        private TicketClaims(Long userId, Long clientSessionId, LocalDateTime expireAt) {
            this.userId = userId;
            this.clientSessionId = clientSessionId;
            this.expireAt = expireAt;
        }

        private boolean isExpired() {
            return expireAt.isBefore(LocalDateTime.now());
        }
    }
}
