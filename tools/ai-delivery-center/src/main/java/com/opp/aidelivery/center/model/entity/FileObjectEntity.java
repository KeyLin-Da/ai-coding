package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_file_object")
@EqualsAndHashCode(callSuper = true)
public class FileObjectEntity extends BaseEntity {

    private String bucket;
    private String cosKey;
    private String cosVersionId;
    private String sha256;
    private Long size;
    private String contentType;
}
