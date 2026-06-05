package com.opp.aidelivery.center;

import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@MapperScan("com.opp.aidelivery.center.mapper")
@EnableConfigurationProperties(AiDeliveryCenterProperties.class)
public class AiDeliveryCenterApplication {

    public static void main(String[] args) {
        SpringApplication.run(AiDeliveryCenterApplication.class, args);
    }
}
