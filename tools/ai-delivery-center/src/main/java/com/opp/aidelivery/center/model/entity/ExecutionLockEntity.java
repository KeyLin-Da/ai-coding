package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_execution_lock")
@EqualsAndHashCode(callSuper = true)
public class ExecutionLockEntity extends BaseEntity {

    private Long requirementPk;
    private String stage;
    private String actionType;
    private Long holderUserId;
    private Long clientSessionId;
    private LocalDateTime expireAt;
    private String status;
}
