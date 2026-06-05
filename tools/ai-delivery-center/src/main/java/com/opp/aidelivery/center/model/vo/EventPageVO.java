package com.opp.aidelivery.center.model.vo;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class EventPageVO {

    private boolean refreshRequired;
    private String refreshScope;
    private Long nextEventId;
    private List<DomainEventVO> events = new ArrayList<>();
}
