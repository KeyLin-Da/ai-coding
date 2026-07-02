package com.opp.aidelivery.center.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.opp.aidelivery.center.model.dto.RequirementCreateRequest;
import com.opp.aidelivery.center.model.vo.RequirementVO;
import com.opp.aidelivery.center.service.RequirementService;
import java.util.Collections;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class RequirementControllerTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private RequirementService requirementService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        requirementService = Mockito.mock(RequirementService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new RequirementController(requirementService)).build();
    }

    @Test
    void createRequirementApiReturnsWorkflow() throws Exception {
        RequirementVO response = new RequirementVO();
        response.setRequirementId("172014");
        response.setTitle("新增定位菜单装修组件");
        when(requirementService.create(eq(1L), any(RequirementCreateRequest.class))).thenReturn(response);

        RequirementCreateRequest request = new RequirementCreateRequest();
        request.setProjectId(10L);
        request.setRequirementId("172014");
        request.setTitle("新增定位菜单装修组件");

        mockMvc.perform(post("/api/ai-delivery/requirements")
                .header("X-User-Id", "1")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.requirementId").value("172014"));
    }

    @Test
    void listRequirementApiReturnsAuthorizedProjectItems() throws Exception {
        when(requirementService.list(1L, 10L)).thenReturn(Collections.emptyList());

        mockMvc.perform(get("/api/ai-delivery/requirements")
                .header("X-User-Id", "1")
                .param("projectId", "10"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true));
    }
}
