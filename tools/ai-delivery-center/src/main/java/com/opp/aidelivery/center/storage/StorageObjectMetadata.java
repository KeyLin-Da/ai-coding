package com.opp.aidelivery.center.storage;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class StorageObjectMetadata {

    private String sha256;
    private long size;
    private String contentType;
    private String versionId;
}
