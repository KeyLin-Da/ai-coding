package com.opp.aidelivery.center.config;

import com.opp.aidelivery.center.service.RedisRealtimeClusterPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

@Configuration
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "ai-delivery.center.websocket", name = "broker", havingValue = "redis")
public class RealtimeRedisConfig {

    private final AiDeliveryCenterProperties properties;

    @Bean
    public RedisMessageListenerContainer realtimeRedisMessageListenerContainer(
        RedisConnectionFactory connectionFactory,
        RedisRealtimeClusterPublisher publisher
    ) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(
            publisher,
            new PatternTopic(properties.getWebsocket().getRedisChannelPrefix() + ":*")
        );
        return container;
    }
}
