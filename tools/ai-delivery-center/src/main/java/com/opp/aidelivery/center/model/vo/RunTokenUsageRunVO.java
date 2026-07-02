package com.opp.aidelivery.center.model.vo;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class RunTokenUsageRunVO {

    private Long runId;
    private TokenUsageSummaryVO summary = new TokenUsageSummaryVO();
    private List<RunTokenUsageDetailVO> details = new ArrayList<>();
}
