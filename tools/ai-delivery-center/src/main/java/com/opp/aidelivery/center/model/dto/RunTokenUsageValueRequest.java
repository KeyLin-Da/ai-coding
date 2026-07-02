package com.opp.aidelivery.center.model.dto;

import lombok.Data;

@Data
public class RunTokenUsageValueRequest {

    private Long inputTokens;
    private Long cachedInputTokens;
    private Long outputTokens;
    private Long reasoningOutputTokens;
}
