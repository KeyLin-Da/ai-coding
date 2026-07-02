package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_artifact")
@EqualsAndHashCode(callSuper = true)
public class ArtifactEntity extends BaseEntity {

    private Long requirementPk;
    private String logicalPath;
    private String label;
    private String kind;
    private String stage;
    private Long currentVersionId;
    @Version
    private Long version;
}
