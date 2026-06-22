package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class RunTokenUsageDetailVO {

    private Long id;
    private Long runId;
    private Long requirementPk;
    private Long jobId;
    private Long clientSessionId;
    private String agentId;
    private String stage;
    private String implementationStep;
    private String model;
    private String sourceEventType;
    private String usageFingerprint;
    private Long inputTokens = 0L;
    private Long cachedInputTokens = 0L;
    private Long outputTokens = 0L;
    private Long reasoningOutputTokens = 0L;
    private Long totalTokens = 0L;
    private String rawUsageJson;
    private LocalDateTime occurredAt;
    private LocalDateTime createdAt;
}
