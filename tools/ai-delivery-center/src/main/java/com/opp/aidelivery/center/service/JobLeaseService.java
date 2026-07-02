package com.opp.aidelivery.center.service;

import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class JobLeaseService {

    private final AiDeliveryCenterProperties properties;
    private final StringRedisTemplate redisTemplate;

    public boolean claim(Long jobId, Long clientSessionId) {
        Boolean success = redisTemplate.opsForValue().setIfAbsent(key(jobId), String.valueOf(clientSessionId), leaseTtl());
        return Boolean.TRUE.equals(success);
    }

    public boolean renew(Long jobId, Long clientSessionId) {
        if (!isHolder(jobId, clientSessionId)) {
            return false;
        }
        Boolean success = redisTemplate.expire(key(jobId), leaseTtl().toMillis(), TimeUnit.MILLISECONDS);
        return Boolean.TRUE.equals(success);
    }

    public boolean isHolder(Long jobId, Long clientSessionId) {
        return String.valueOf(clientSessionId).equals(redisTemplate.opsForValue().get(key(jobId)));
    }

    public void release(Long jobId, Long clientSessionId) {
        if (isHolder(jobId, clientSessionId)) {
            redisTemplate.delete(key(jobId));
        }
    }

    private Duration leaseTtl() {
        return properties.getJob().getLeaseTtl();
    }

    private String key(Long jobId) {
        return properties.getRedis().getKeyPrefix() + ":job:" + jobId + ":lease";
    }
}
