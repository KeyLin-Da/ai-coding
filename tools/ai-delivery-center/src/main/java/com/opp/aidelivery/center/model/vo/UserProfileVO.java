package com.opp.aidelivery.center.model.vo;

import lombok.Data;

@Data
public class UserProfileVO {

    private Long id;
    private String account;
    private String displayName;
    private String avatarUrl;
    private String status;
}
