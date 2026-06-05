package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_run")
@EqualsAndHashCode(callSuper = true)
public class RunEntity extends BaseEntity {

    private Long jobId;
    private Long requirementPk;
    private String status;
    private Long clientSessionId;
    private String agentId;
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;
    private String errorMessage;
}
