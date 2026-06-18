package com.opp.aidelivery.center.controller;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.opp.aidelivery.center.config.SecurityConfig;
import com.opp.aidelivery.center.model.vo.ArtifactSharePublicVO;
import com.opp.aidelivery.center.service.ArtifactShareService;
import com.opp.aidelivery.center.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(controllers = ArtifactShareController.class)
@Import({SecurityConfig.class, ArtifactShareController.class})
class ArtifactShareControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ArtifactShareService artifactShareService;

    @MockBean
    private AuthService authService;

    @SpringBootConfiguration
    @EnableAutoConfiguration
    static class TestApplication {
    }

    @Test
    void publicResolveApiDoesNotRequireLogin() throws Exception {
        ArtifactSharePublicVO vo = new ArtifactSharePublicVO();
        vo.setId(1L);
        vo.setProjectId(10L);
        vo.setRequirementId("172014");
        vo.setArtifactPath("docs/172014/technical-design/design_review.md");
        when(artifactShareService.resolvePublicShare("token-1")).thenReturn(vo);

        mockMvc.perform(get("/api/ai-delivery/public-artifact-shares/token-1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data.artifactPath").value("docs/172014/technical-design/design_review.md"));

        verify(authService, never()).authenticate(anyString());
    }

    @Test
    void managementApiRequiresLogin() throws Exception {
        mockMvc.perform(get("/api/ai-delivery/artifact-shares").param("projectId", "10"))
            .andExpect(status().isForbidden());
    }
}
