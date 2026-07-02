package com.opp.aidelivery.center.model.dto;

import java.util.ArrayList;
import java.util.List;
import javax.validation.constraints.NotNull;
import lombok.Data;

@Data
public class JobClaimRequest {

    @NotNull
    private Long clientSessionId;

    private List<String> capabilities = new ArrayList<>();
}
