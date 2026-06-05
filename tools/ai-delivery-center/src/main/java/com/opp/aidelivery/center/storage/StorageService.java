package com.opp.aidelivery.center.storage;

import java.time.Duration;

public interface StorageService {

    String createUploadUrl(String objectKey, String contentType, Duration ttl);

    String createPreviewUrl(String objectKey, Duration ttl);

    StorageObjectMetadata getObjectMetadata(String objectKey);
}
