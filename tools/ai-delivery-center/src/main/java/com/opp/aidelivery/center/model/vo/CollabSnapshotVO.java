package com.opp.aidelivery.center.model.vo;

import java.time.LocalDateTime;
import lombok.Data;

@Data
public class CollabSnapshotVO {

    private Long id;
    private Long documentId;
    private Long seq;
    private String content;
    private String sha256;
    private LocalDateTime createdAt;
}
