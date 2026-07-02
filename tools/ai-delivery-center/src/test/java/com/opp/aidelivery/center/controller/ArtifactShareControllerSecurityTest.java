package com.opp.aidelivery.center.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.opp.aidelivery.center.config.SecurityConfig;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationCreateRequest;
import com.opp.aidelivery.center.model.vo.ArtifactSharePublicVO;
import com.opp.aidelivery.center.model.vo.TechDesignAnnotationVO;
import com.opp.aidelivery.center.service.ArtifactShareService;
import com.opp.aidelivery.center.service.AuthService;
import com.opp.aidelivery.center.service.TechDesignAnnotationService;
import java.util.Collections;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;

@WebMvcTest(controllers = ArtifactShareController.class)
@Import({SecurityConfig.class, ArtifactShareController.class})
class ArtifactShareControllerSecurityTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ArtifactShareService artifactShareService;

    @MockBean
    private TechDesignAnnotationService techDesignAnnotationService;

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
    void publicAnnotationApiDoesNotRequireLogin() throws Exception {
        ArtifactSharePublicVO share = new ArtifactSharePublicVO();
        share.setId(1L);
        share.setRequirementPk(100L);
        share.setRequirementId("172014");
        share.setShowAnnotations(true);
        TechDesignAnnotationVO annotation = new TechDesignAnnotationVO();
        annotation.setId("annotation-1");
        annotation.setCreatedByName("评审张三");
        when(artifactShareService.resolvePublicShareForAnnotations("token-1")).thenReturn(share);
        when(techDesignAnnotationService.listPublic(100L, "current")).thenReturn(Collections.singletonList(annotation));

        mockMvc.perform(get("/api/ai-delivery/public-artifact-shares/token-1/tech-design-annotations").param("versionId", "current"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.success").value(true))
            .andExpect(jsonPath("$.data[0].createdByName").value("评审张三"));

        verify(authService, never()).authenticate(anyString());
    }

    @Test
    void managementApiRequiresLogin() throws Exception {
        mockMvc.perform(get("/api/ai-delivery/artifact-shares").param("projectId", "10"))
            .andExpect(status().isForbidden());
    }

    @Test
    void publicAnnotationWritesRequireLogin() throws Exception {
        mockMvc.perform(post("/api/ai-delivery/public-artifact-shares/token-1/tech-design-annotations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"artifactPath\":\"docs/172014/technical-design/design_review.md\",\"versionId\":\"current\",\"selectedText\":\"正文\",\"comment\":\"意见\",\"anchor\":{\"plainStart\":0,\"plainEnd\":2}}"))
            .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/ai-delivery/public-artifact-shares/token-1/tech-design-annotations/annotation-1/delete"))
            .andExpect(status().isForbidden());
    }

    @Test
    void authenticatedShareRecipientCanCreateAnnotation() throws Exception {
        ArtifactSharePublicVO share = publicAnnotationShare();
        when(artifactShareService.resolvePublicShareForAnnotations("token-1")).thenReturn(share);
        when(techDesignAnnotationService.createPublic(
            eq(2L),
            eq(100L),
            eq("docs/172014/technical-design/design_review.md"),
            any(TechDesignAnnotationCreateRequest.class)
        )).thenReturn(Collections.emptyList());

        mockMvc.perform(post("/api/ai-delivery/public-artifact-shares/token-1/tech-design-annotations")
                .header("X-User-Id", "2")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"artifactPath\":\"docs/172014/technical-design/design_review.md\",\"versionId\":\"current\",\"selectedText\":\"正文\",\"comment\":\"意见\",\"anchor\":{\"plainStart\":0,\"plainEnd\":2}}"))
            .andExpect(status().isOk());
    }

    private ArtifactSharePublicVO publicAnnotationShare() {
        ArtifactSharePublicVO share = new ArtifactSharePublicVO();
        share.setId(1L);
        share.setRequirementPk(100L);
        share.setRequirementId("172014");
        share.setArtifactPath("docs/172014/technical-design/design_review.md");
        share.setShowAnnotations(true);
        return share;
    }
}
