package com.opp.aidelivery.center.model.vo;

import lombok.Data;

@Data
public class RunTokenUsageSaveVO {

    private RunTokenUsageDetailVO detail;
    private TokenUsageSummaryVO runSummary = new TokenUsageSummaryVO();
}
