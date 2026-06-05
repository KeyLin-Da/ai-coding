package com.opp.aidelivery.center.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.qcloud.cos.COSClient;
import com.qcloud.cos.model.GeneratePresignedUrlRequest;
import com.qcloud.cos.model.ObjectMetadata;
import java.net.URL;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CosStorageServiceTest {

    private static final String HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    @Mock
    private COSClient cosClient;

    private AiDeliveryCenterProperties properties;
    private CosStorageService storageService;

    @BeforeEach
    void setUp() {
        properties = new AiDeliveryCenterProperties();
        properties.getCos().setBucket("delivery-bucket");
        storageService = new CosStorageService(cosClient, properties);
    }

    @Test
    void createUploadUrlUsesPutPresignedRequest() throws Exception {
        when(cosClient.generatePresignedUrl(any(GeneratePresignedUrlRequest.class))).thenReturn(new URL("https://cos.example/upload"));

        String url = storageService.createUploadUrl("artifact.md", "text/markdown", Duration.ofMinutes(5));

        assertThat(url).isEqualTo("https://cos.example/upload");
        ArgumentCaptor<GeneratePresignedUrlRequest> captor = ArgumentCaptor.forClass(GeneratePresignedUrlRequest.class);
        verify(cosClient).generatePresignedUrl(captor.capture());
        assertThat(captor.getValue().getBucketName()).isEqualTo("delivery-bucket");
        assertThat(captor.getValue().getKey()).isEqualTo("artifact.md");
    }

    @Test
    void getObjectMetadataReadsHashSizeAndContentType() {
        ObjectMetadata metadata = new ObjectMetadata();
        metadata.setContentLength(1024L);
        metadata.setContentType("text/markdown");
        metadata.addUserMetadata("sha256", HASH);
        when(cosClient.getObjectMetadata(eq("delivery-bucket"), eq("artifact.md"))).thenReturn(metadata);

        StorageObjectMetadata result = storageService.getObjectMetadata("artifact.md");

        assertThat(result.getSha256()).isEqualTo(HASH);
        assertThat(result.getSize()).isEqualTo(1024L);
        assertThat(result.getContentType()).isEqualTo("text/markdown");
    }
}
