package com.opp.aidelivery.center.model.vo;

import lombok.Data;

@Data
public class TokenUsageBucketVO {

    private String bucketType;
    private String bucketKey;
    private TokenUsageSummaryVO summary = new TokenUsageSummaryVO();
}
