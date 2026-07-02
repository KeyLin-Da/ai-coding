package com.opp.aidelivery.center.model.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import java.time.LocalDateTime;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@TableName("ad_user_git_credential")
@EqualsAndHashCode(callSuper = true)
public class UserGitCredentialEntity extends BaseEntity {

    private Long userId;
    private String platform;
    private String fingerprint;
    private String publicKey;
    private String status;
    private LocalDateTime generatedAt;
    private LocalDateTime revokedAt;
}
