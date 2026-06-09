package com.opp.aidelivery.center.storage;

import java.time.Duration;

public interface StorageService {

    String createUploadUrl(String objectKey, String contentType, Duration ttl);

    String createPreviewUrl(String objectKey, Duration ttl);

    StorageObjectMetadata getObjectMetadata(String objectKey);

    default void putObject(String objectKey, byte[] content, String contentType, String sha256) {
        throw new UnsupportedOperationException("putObject is not supported");
    }

    default void deleteObject(String objectKey) {
        throw new UnsupportedOperationException("deleteObject is not supported");
    }
}
