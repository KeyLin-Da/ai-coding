package com.opp.aidelivery.center.model.vo;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class RequirementTokenUsagePageVO {

    private Long requirementPk;
    private long page;
    private long pageSize;
    private long total;
    private List<RunTokenUsageDetailVO> items = new ArrayList<>();
}
