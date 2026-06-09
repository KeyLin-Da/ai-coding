package com.opp.aidelivery.center.model.dto;

import java.util.ArrayList;
import java.util.List;
import javax.validation.constraints.NotNull;
import lombok.Data;

@Data
public class PreflightRequest {

    @NotNull
    private Long projectId;

    private Long clientSessionId;

    private List<String> checks = new ArrayList<>();

    private Boolean testObjectStorage = true;
}
