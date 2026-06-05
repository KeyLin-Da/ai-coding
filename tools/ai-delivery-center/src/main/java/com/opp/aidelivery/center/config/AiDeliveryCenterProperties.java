package com.opp.aidelivery.center.config;

import java.time.Duration;
import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "ai-delivery.center")
public class AiDeliveryCenterProperties {

    private Cos cos = new Cos();
    private Redis redis = new Redis();
    private Job job = new Job();
    private Event event = new Event();
    private Security security = new Security();
    private Websocket websocket = new Websocket();

    @Data
    public static class Cos {
        private String bucket;
        private String region;
        private String secretId;
        private String secretKey;
        private Duration signedUrlTtl = Duration.ofMinutes(10);
        private boolean bucketVersioningEnabled = true;
    }

    @Data
    public static class Redis {
        private String keyPrefix = "ai-delivery";
    }

    @Data
    public static class Job {
        private Duration leaseTtl = Duration.ofSeconds(60);
        private Duration heartbeatInterval = Duration.ofSeconds(20);
        private int maxRetryTimes = 3;
    }

    @Data
    public static class Event {
        private Duration retainedWindow = Duration.ofDays(7);
        private int pageSize = 500;
        private int inlineMessageMaxLength = 4000;
    }

    @Data
    public static class Security {
        private String jwtIssuer = "ai-delivery-center";
        private String jwtSecret = "change-me";
        private Duration accessTokenTtl = Duration.ofHours(8);
    }

    @Data
    public static class Websocket {
        private Duration heartbeatInterval = Duration.ofSeconds(30);
    }
}
