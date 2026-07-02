package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class TokenUsageSummaryVO {

    private Long runId;
    private Long totalTokens = 0L;
    private Long inputTokens = 0L;
    private Long cachedInputTokens = 0L;
    private Long outputTokens = 0L;
    private Long reasoningOutputTokens = 0L;
    private Long runCount = 0L;
    private Long detailCount = 0L;
    private LocalDateTime latestOccurredAt;
}
