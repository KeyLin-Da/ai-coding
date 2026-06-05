package com.opp.aidelivery.center.config;

import com.qcloud.cos.COSClient;
import com.qcloud.cos.ClientConfig;
import com.qcloud.cos.auth.BasicCOSCredentials;
import com.qcloud.cos.auth.COSCredentials;
import com.qcloud.cos.region.Region;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class CosConfig {

    @Bean
    public COSClient cosClient(AiDeliveryCenterProperties properties) {
        COSCredentials credentials = new BasicCOSCredentials(
            properties.getCos().getSecretId(),
            properties.getCos().getSecretKey()
        );
        ClientConfig config = new ClientConfig(new Region(properties.getCos().getRegion()));
        return new COSClient(credentials, config);
    }
}
