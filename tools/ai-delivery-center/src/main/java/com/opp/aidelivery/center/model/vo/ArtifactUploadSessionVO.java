package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class ArtifactUploadSessionVO {

    private Long uploadSessionId;
    private String uploadUrl;
    private LocalDateTime expireAt;
}
