package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

@ExtendWith(MockitoExtension.class)
class JobLeaseServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;
    @Mock
    private ValueOperations<String, String> valueOperations;

    private AiDeliveryCenterProperties properties;
    private JobLeaseService jobLeaseService;

    @BeforeEach
    void setUp() {
        properties = new AiDeliveryCenterProperties();
        properties.getRedis().setKeyPrefix("ai-delivery");
        properties.getJob().setLeaseTtl(Duration.ofSeconds(60));
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        jobLeaseService = new JobLeaseService(properties, redisTemplate);
    }

    @Test
    void claimUsesRedisSetIfAbsentWithLeaseTtl() {
        when(valueOperations.setIfAbsent("ai-delivery:job:500:lease", "10", Duration.ofSeconds(60))).thenReturn(true);

        boolean result = jobLeaseService.claim(500L, 10L);

        assertThat(result).isTrue();
    }

    @Test
    void renewFailsWhenCurrentLeaseHolderDiffers() {
        when(valueOperations.get("ai-delivery:job:500:lease")).thenReturn("11");

        boolean result = jobLeaseService.renew(500L, 10L);

        assertThat(result).isFalse();
        verify(redisTemplate, never()).expire(eq("ai-delivery:job:500:lease"), eq(60000L), eq(TimeUnit.MILLISECONDS));
    }

    @Test
    void releaseDeletesOnlyCurrentHolderLease() {
        when(valueOperations.get("ai-delivery:job:500:lease")).thenReturn("10");

        jobLeaseService.release(500L, 10L);

        verify(redisTemplate).delete("ai-delivery:job:500:lease");
    }
}
