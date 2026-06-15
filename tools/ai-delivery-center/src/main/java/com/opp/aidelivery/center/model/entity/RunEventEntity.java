package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_run_event")
@EqualsAndHashCode(callSuper = true)
public class RunEventEntity extends BaseEntity {

    private Long runId;
    private Long seq;
    private String level;
    private String type;
    private String message;
    private String payloadJson;
}
