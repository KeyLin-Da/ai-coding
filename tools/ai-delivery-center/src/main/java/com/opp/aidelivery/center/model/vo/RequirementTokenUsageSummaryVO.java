package com.opp.aidelivery.center.model.vo;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class RequirementTokenUsageSummaryVO {

    private Long requirementPk;
    private TokenUsageSummaryVO summary = new TokenUsageSummaryVO();
    private TokenUsageSummaryVO latestRunSummary = new TokenUsageSummaryVO();
    private List<TokenUsageBucketVO> stageSummaries = new ArrayList<>();
    private List<TokenUsageBucketVO> agentSummaries = new ArrayList<>();
}
