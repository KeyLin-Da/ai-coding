package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_import_item")
@EqualsAndHashCode(callSuper = true)
public class ImportItemEntity extends BaseEntity {

    private Long importSessionId;
    private String itemType;
    private String sourceKey;
    private String sourceSha256;
    private String targetType;
    private Long targetId;
    private String status;
    private String errorMessage;
}
