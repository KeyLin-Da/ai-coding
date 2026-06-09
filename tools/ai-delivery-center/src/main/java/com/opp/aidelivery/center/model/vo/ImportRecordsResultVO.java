package com.opp.aidelivery.center.model.vo;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class ImportRecordsResultVO {

    private List<ImportRecordResultVO> results = new ArrayList<>();
    private Integer importedCount = 0;
    private Integer skippedCount = 0;
    private Integer failedCount = 0;
    private Integer duplicatedCount = 0;
    private Integer conflictedCount = 0;
}
