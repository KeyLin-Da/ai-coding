package com.opp.aidelivery.center.storage;

import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.qcloud.cos.COSClient;
import com.qcloud.cos.http.HttpMethodName;
import com.qcloud.cos.model.GeneratePresignedUrlRequest;
import com.qcloud.cos.model.ObjectMetadata;
import java.time.Duration;
import java.util.Date;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CosStorageService implements StorageService {

    private static final String SHA256_META_KEY = "sha256";

    private final COSClient cosClient;
    private final AiDeliveryCenterProperties properties;

    @Override
    public String createUploadUrl(String objectKey, String contentType, Duration ttl) {
        GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(
            properties.getCos().getBucket(),
            objectKey,
            HttpMethodName.PUT
        );
        request.setExpiration(expiration(ttl));
        request.addRequestParameter("Content-Type", contentType);
        return cosClient.generatePresignedUrl(request).toString();
    }

    @Override
    public String createPreviewUrl(String objectKey, Duration ttl) {
        GeneratePresignedUrlRequest request = new GeneratePresignedUrlRequest(
            properties.getCos().getBucket(),
            objectKey,
            HttpMethodName.GET
        );
        request.setExpiration(expiration(ttl));
        return cosClient.generatePresignedUrl(request).toString();
    }

    @Override
    public StorageObjectMetadata getObjectMetadata(String objectKey) {
        ObjectMetadata metadata = cosClient.getObjectMetadata(properties.getCos().getBucket(), objectKey);
        String sha256 = metadata.getUserMetaDataOf(SHA256_META_KEY);
        return new StorageObjectMetadata(sha256, metadata.getContentLength(), metadata.getContentType(), null);
    }

    private Date expiration(Duration ttl) {
        return new Date(System.currentTimeMillis() + ttl.toMillis());
    }
}
