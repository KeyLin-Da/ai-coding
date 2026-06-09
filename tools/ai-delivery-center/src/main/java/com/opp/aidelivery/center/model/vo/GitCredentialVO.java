package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class GitCredentialVO {

    private Long id;
    private String platform;
    private String fingerprint;
    private String publicKey;
    private String status;
    private LocalDateTime generatedAt;
    private LocalDateTime revokedAt;
}
