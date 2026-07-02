package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class AuthSessionVO {

    private String token;
    private LocalDateTime expireAt;
    private UserProfileVO user;
}
