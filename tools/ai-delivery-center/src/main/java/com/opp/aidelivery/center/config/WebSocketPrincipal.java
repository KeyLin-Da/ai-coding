package com.opp.aidelivery.center.config;

import java.security.Principal;
import lombok.Getter;

@Getter
public class WebSocketPrincipal implements Principal {

    private final Long userId;
    private final Long clientSessionId;
    private final String name;

    public WebSocketPrincipal(Long userId, Long clientSessionId) {
        this.userId = userId;
        this.clientSessionId = clientSessionId;
        this.name = String.valueOf(userId);
    }
}
