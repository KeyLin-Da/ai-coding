package com.opp.aidelivery.center.model.dto;

import java.util.ArrayList;
import java.util.List;
import lombok.Data;

@Data
public class ClientSessionHeartbeatRequest {

    private List<String> capabilities = new ArrayList<>();
}
