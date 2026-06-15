package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ArtifactGitVersionMapper;
import com.opp.aidelivery.center.mapper.ArtifactMapper;
import com.opp.aidelivery.center.mapper.CollabDocumentMapper;
import com.opp.aidelivery.center.mapper.CollabOperationMapper;
import com.opp.aidelivery.center.mapper.CollabSnapshotMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.dto.CollabDocumentOpenRequest;
import com.opp.aidelivery.center.model.dto.CollabOperationCreateRequest;
import com.opp.aidelivery.center.model.entity.ArtifactEntity;
import com.opp.aidelivery.center.model.entity.ArtifactGitVersionEntity;
import com.opp.aidelivery.center.model.entity.CollabDocumentEntity;
import com.opp.aidelivery.center.model.entity.CollabOperationEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CollabDocumentServiceTest {

    @Mock
    private PermissionService permissionService;
    @Mock
    private ArtifactMapper artifactMapper;
    @Mock
    private ArtifactGitVersionMapper artifactGitVersionMapper;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private CollabDocumentMapper collabDocumentMapper;
    @Mock
    private CollabOperationMapper collabOperationMapper;
    @Mock
    private CollabSnapshotMapper collabSnapshotMapper;

    private CollabDocumentService service;

    @BeforeEach
    void setUp() {
        service = new CollabDocumentService(
            permissionService,
            artifactMapper,
            artifactGitVersionMapper,
            requirementMapper,
            collabDocumentMapper,
            collabOperationMapper,
            collabSnapshotMapper
        );
    }

    @Test
    void openDraftCreatesTextDraft() {
        stubArtifactWithVersion("docs/172014/prd/analysis.md", 400L);
        when(collabDocumentMapper.selectOne(any())).thenReturn(null);
        when(collabDocumentMapper.insert(any())).thenAnswer(invocation -> {
            CollabDocumentEntity document = invocation.getArgument(0);
            document.setId(900L);
            return 1;
        });

        assertThat(service.openDraft(1L, openRequest(400L)).getDocumentType()).isEqualTo("MARKDOWN");
    }

    @Test
    void openDraftRejectsBinaryArtifact() {
        stubArtifactWithVersion("docs/172014/prd/report.pdf", 400L);

        assertThatThrownBy(() -> service.openDraft(1L, openRequest(400L)))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.VALIDATION_FAILED);

        verify(collabDocumentMapper, never()).insert(any());
    }

    @Test
    void openDraftRejectsStaleBaseVersion() {
        when(artifactMapper.selectById(200L)).thenReturn(artifact(401L));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());

        assertThatThrownBy(() -> service.openDraft(1L, openRequest(400L)))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.COLLAB_DRAFT_BASE_STALE);
    }

    @Test
    void appendOperationRejectsNonMonotonicSequence() {
        when(collabDocumentMapper.selectById(900L)).thenReturn(document());
        when(artifactMapper.selectById(200L)).thenReturn(artifact(400L));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        CollabOperationEntity latest = new CollabOperationEntity();
        latest.setSeq(5L);
        when(collabOperationMapper.selectOne(any())).thenReturn(latest);

        CollabOperationCreateRequest request = new CollabOperationCreateRequest();
        request.setDocumentId(900L);
        request.setSeq(5L);
        request.setOperationType("insert");
        request.setOperationPayload("{}");

        assertThatThrownBy(() -> service.appendOperation(1L, request))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.VALIDATION_FAILED);

        verify(collabOperationMapper, never()).insert(any());
    }

    private void stubArtifactWithVersion(String filePath, Long currentVersionId) {
        when(artifactMapper.selectById(200L)).thenReturn(artifact(currentVersionId));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        ArtifactGitVersionEntity version = new ArtifactGitVersionEntity();
        version.setId(currentVersionId);
        version.setArtifactId(200L);
        version.setFilePath(filePath);
        when(artifactGitVersionMapper.selectById(currentVersionId)).thenReturn(version);
    }

    private CollabDocumentOpenRequest openRequest(Long baseVersionId) {
        CollabDocumentOpenRequest request = new CollabDocumentOpenRequest();
        request.setArtifactId(200L);
        request.setBaseVersionId(baseVersionId);
        return request;
    }

    private ArtifactEntity artifact(Long currentVersionId) {
        ArtifactEntity artifact = new ArtifactEntity();
        artifact.setId(200L);
        artifact.setRequirementPk(100L);
        artifact.setCurrentVersionId(currentVersionId);
        return artifact;
    }

    private RequirementEntity requirement() {
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(100L);
        requirement.setProjectId(10L);
        return requirement;
    }

    private CollabDocumentEntity document() {
        CollabDocumentEntity document = new CollabDocumentEntity();
        document.setId(900L);
        document.setArtifactId(200L);
        document.setBaseVersionId(400L);
        document.setStatus("DRAFT");
        return document;
    }
}
