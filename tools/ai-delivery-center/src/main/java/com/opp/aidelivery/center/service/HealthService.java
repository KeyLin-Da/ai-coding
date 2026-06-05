package com.opp.aidelivery.center.service;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class HealthService {

    public Map<String, Object> health() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("service", "ai-delivery-center");
        result.put("status", "UP");
        result.put("time", OffsetDateTime.now().toString());
        return result;
    }
}
