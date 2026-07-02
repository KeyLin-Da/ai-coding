package com.opp.aidelivery.center.model.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;

class RunTokenUsageCreateRequestJsonTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    @Test
    void deserializesUtcOccurrenceWithoutDroppingOffset() throws Exception {
        RunTokenUsageCreateRequest request = objectMapper.readValue(
            "{\"occurredAt\":\"2026-06-22T05:39:05.113Z\"}",
            RunTokenUsageCreateRequest.class);

        assertThat(request.getOccurredAt().getOffset()).isEqualTo(ZoneOffset.UTC);
        assertThat(request.getOccurredAt().toInstant()).isEqualTo(Instant.parse("2026-06-22T05:39:05.113Z"));
    }
}
