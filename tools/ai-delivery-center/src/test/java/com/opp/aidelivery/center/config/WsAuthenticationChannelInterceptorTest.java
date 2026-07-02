package com.opp.aidelivery.center.config;

import static org.mockito.Mockito.verify;

import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.RunMapper;
import com.opp.aidelivery.center.service.ArtifactShareService;
import com.opp.aidelivery.center.service.PermissionService;
import com.opp.aidelivery.center.service.WsSessionService;
import com.opp.aidelivery.center.service.WsTicketService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.Message;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;

@ExtendWith(MockitoExtension.class)
class WsAuthenticationChannelInterceptorTest {

    @Mock
    private WsTicketService wsTicketService;
    @Mock
    private WsSessionService wsSessionService;
    @Mock
    private PermissionService permissionService;
    @Mock
    private ArtifactShareService artifactShareService;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private RunMapper runMapper;

    private WsAuthenticationChannelInterceptor interceptor;

    @BeforeEach
    void setUp() {
        interceptor = new WsAuthenticationChannelInterceptor(
            wsTicketService,
            wsSessionService,
            permissionService,
            artifactShareService,
            requirementMapper,
            runMapper
        );
    }

    @Test
    void shareTopicSubscriptionUsesTokenInsteadOfProjectMembership() {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(StompCommand.SUBSCRIBE);
        accessor.setDestination("/topic/artifact-shares/300/channel-hash/annotations");
        accessor.setNativeHeader("share-token", "public-token");
        accessor.setUser(new WebSocketPrincipal(2L, 9L));
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());

        interceptor.preSend(message, null);

        verify(artifactShareService).assertRealtimeAnnotationSubscription("public-token", 300L, "channel-hash");
    }
}
