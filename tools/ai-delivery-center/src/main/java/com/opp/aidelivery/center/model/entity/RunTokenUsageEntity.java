package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_run_token_usage")
@EqualsAndHashCode(callSuper = true)
public class RunTokenUsageEntity extends BaseEntity {

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
    private Long inputTokens;
    private Long cachedInputTokens;
    private Long outputTokens;
    private Long reasoningOutputTokens;
    private Long totalTokens;
    private String rawUsageJson;
    private LocalDateTime occurredAt;
}
