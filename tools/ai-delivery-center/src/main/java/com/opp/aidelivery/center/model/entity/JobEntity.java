package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_job")
@EqualsAndHashCode(callSuper = true)
public class JobEntity extends BaseEntity {

    private Long requirementPk;
    private String actionType;
    private String paramsJson;
    private String status;
    private Long claimedBy;
    private LocalDateTime leaseExpireAt;
    private Integer retryTimes;
    private Long createdBy;
}
