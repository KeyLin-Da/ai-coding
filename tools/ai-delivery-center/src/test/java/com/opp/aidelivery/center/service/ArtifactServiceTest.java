package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.mapper.ArtifactMapper;
import com.opp.aidelivery.center.mapper.ArtifactUploadSessionMapper;
import com.opp.aidelivery.center.mapper.ArtifactVersionMapper;
import com.opp.aidelivery.center.mapper.FileObjectMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.model.dto.ArtifactUploadSessionCreateRequest;
import com.opp.aidelivery.center.model.dto.ArtifactVersionCompleteRequest;
import com.opp.aidelivery.center.model.entity.ArtifactEntity;
import com.opp.aidelivery.center.model.entity.ArtifactUploadSessionEntity;
import com.opp.aidelivery.center.model.entity.ArtifactVersionEntity;
import com.opp.aidelivery.center.model.entity.FileObjectEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.vo.ArtifactUploadSessionVO;
import com.opp.aidelivery.center.model.vo.ArtifactVersionConflictVO;
import com.opp.aidelivery.center.model.vo.ArtifactVersionVO;
import com.opp.aidelivery.center.storage.StorageObjectMetadata;
import com.opp.aidelivery.center.storage.StorageService;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ArtifactServiceTest {

    private static final String HASH = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    @Mock
    private StorageService storageService;
    @Mock
    private PermissionService permissionService;
    @Mock
    private ArtifactMapper artifactMapper;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private ArtifactUploadSessionMapper uploadSessionMapper;
    @Mock
    private FileObjectMapper fileObjectMapper;
    @Mock
    private ArtifactVersionMapper artifactVersionMapper;
    @Mock
    private DomainEventService domainEventService;

    private AiDeliveryCenterProperties properties;
    private ArtifactService artifactService;

    @BeforeEach
    void setUp() {
        properties = new AiDeliveryCenterProperties();
        properties.getCos().setBucket("delivery-bucket");
        properties.getCos().setSignedUrlTtl(Duration.ofMinutes(5));
        artifactService = new ArtifactService(
            properties,
            storageService,
            permissionService,
            artifactMapper,
            requirementMapper,
            uploadSessionMapper,
            fileObjectMapper,
            artifactVersionMapper,
            domainEventService
        );
    }

    @Test
    void createUploadSessionReturnsPresignedUrlAndStoresExpectedMetadata() {
        when(artifactMapper.selectById(200L)).thenReturn(artifact(null));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(storageService.createUploadUrl(anyString(), eq("text/markdown"), eq(Duration.ofMinutes(5)))).thenReturn("https://cos.example/upload");
        doAnswer(invocation -> {
            ArtifactUploadSessionEntity entity = invocation.getArgument(0);
            entity.setId(300L);
            return 1;
        }).when(uploadSessionMapper).insert(any(ArtifactUploadSessionEntity.class));

        ArtifactUploadSessionCreateRequest request = uploadRequest(null);
        ArtifactUploadSessionVO result = artifactService.createUploadSession(1L, request);

        assertThat(result.getUploadSessionId()).isEqualTo(300L);
        assertThat(result.getUploadUrl()).isEqualTo("https://cos.example/upload");
        assertThat(result.getExpireAt()).isAfter(LocalDateTime.now());
        ArgumentCaptor<ArtifactUploadSessionEntity> captor = ArgumentCaptor.forClass(ArtifactUploadSessionEntity.class);
        verify(uploadSessionMapper).insert(captor.capture());
        assertThat(captor.getValue().getExpectedSha256()).isEqualTo(HASH);
        assertThat(captor.getValue().getCosKey()).contains("/artifacts/200/uploads/");
        verify(permissionService).assertProjectMember(1L, 10L);
    }

    @Test
    void completeUploadCreatesFileVersionCurrentPointerAndDomainEvent() {
        ArtifactUploadSessionEntity session = session(400L);
        ArtifactVersionEntity previous = version(400L, 1, 500L);
        AtomicReference<FileObjectEntity> insertedFile = new AtomicReference<>();

        when(uploadSessionMapper.selectById(300L)).thenReturn(session);
        when(artifactMapper.selectById(200L)).thenReturn(artifact(400L));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(storageService.getObjectMetadata("cos/key.md")).thenReturn(new StorageObjectMetadata(HASH, 1024L, "text/markdown", "cos-version-1"));
        when(artifactVersionMapper.selectList(any())).thenReturn(Collections.singletonList(previous));
        when(fileObjectMapper.selectById(501L)).thenAnswer(invocation -> insertedFile.get());
        doAnswer(invocation -> {
            FileObjectEntity entity = invocation.getArgument(0);
            entity.setId(501L);
            insertedFile.set(entity);
            return 1;
        }).when(fileObjectMapper).insert(any(FileObjectEntity.class));
        doAnswer(invocation -> {
            ArtifactVersionEntity entity = invocation.getArgument(0);
            entity.setId(401L);
            return 1;
        }).when(artifactVersionMapper).insert(any(ArtifactVersionEntity.class));
        when(artifactMapper.updateById(any(ArtifactEntity.class))).thenReturn(1);

        ArtifactVersionVO result = artifactService.completeUpload(1L, completeRequest(400L));

        assertThat(result.getId()).isEqualTo(401L);
        assertThat(result.getVersionNo()).isEqualTo(2);
        assertThat(result.getSha256()).isEqualTo(HASH);
        assertThat(result.getSize()).isEqualTo(1024L);
        verify(uploadSessionMapper).updateById(session);
        ArgumentCaptor<ArtifactEntity> artifactCaptor = ArgumentCaptor.forClass(ArtifactEntity.class);
        verify(artifactMapper).updateById(artifactCaptor.capture());
        assertThat(artifactCaptor.getValue().getCurrentVersionId()).isEqualTo(401L);
        verify(domainEventService).publishAfterCommit(eq(10L), eq("artifact.version.created"), eq("ARTIFACT"), eq(200L), anyString());
    }

    @Test
    void completeUploadRejectsHashMismatch() {
        when(uploadSessionMapper.selectById(300L)).thenReturn(session(400L));
        when(artifactMapper.selectById(200L)).thenReturn(artifact(400L));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(storageService.getObjectMetadata("cos/key.md")).thenReturn(new StorageObjectMetadata("bad-hash", 1024L, "text/markdown", null));

        assertThatThrownBy(() -> artifactService.completeUpload(1L, completeRequest(400L)))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.COS_OBJECT_MISMATCH);

        verify(fileObjectMapper, never()).insert(any());
        verify(artifactVersionMapper, never()).insert(any());
    }

    @Test
    void completeUploadRejectsStaleBaseVersionWithCurrentVersionInfo() {
        ArtifactVersionEntity current = version(400L, 1, 500L);
        when(uploadSessionMapper.selectById(300L)).thenReturn(session(399L));
        when(artifactMapper.selectById(200L)).thenReturn(artifact(400L));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(artifactVersionMapper.selectById(400L)).thenReturn(current);
        when(fileObjectMapper.selectById(500L)).thenReturn(fileObject(500L));

        assertThatThrownBy(() -> artifactService.completeUpload(1L, completeRequest(399L)))
            .isInstanceOf(BusinessException.class)
            .satisfies(throwable -> {
                BusinessException exception = (BusinessException) throwable;
                assertThat(exception.getErrorCode()).isEqualTo(AiDeliveryErrorCode.ARTIFACT_VERSION_CONFLICT);
                ArtifactVersionConflictVO data = (ArtifactVersionConflictVO) exception.getData();
                assertThat(data.getCurrentVersionId()).isEqualTo(400L);
                assertThat(data.getCurrentVersion().getSha256()).isEqualTo(HASH);
            });

        verify(storageService, never()).getObjectMetadata(anyString());
    }

    @Test
    void previewUrlRejectsUnauthorizedUserBeforeCreatingCosUrl() {
        when(artifactMapper.selectById(200L)).thenReturn(artifact(400L));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        BusinessException denied = new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED);
        org.mockito.Mockito.doThrow(denied).when(permissionService).assertProjectMember(2L, 10L);

        assertThatThrownBy(() -> artifactService.previewUrl(2L, 200L, 400L))
            .isSameAs(denied);

        verify(storageService, never()).createPreviewUrl(anyString(), any());
    }

    private ArtifactUploadSessionCreateRequest uploadRequest(Long baseVersionId) {
        ArtifactUploadSessionCreateRequest request = new ArtifactUploadSessionCreateRequest();
        request.setArtifactId(200L);
        request.setBaseVersionId(baseVersionId);
        request.setFileName("analysis.md");
        request.setSha256(HASH);
        request.setSize(1024L);
        request.setContentType("text/markdown");
        return request;
    }

    private ArtifactVersionCompleteRequest completeRequest(Long baseVersionId) {
        ArtifactVersionCompleteRequest request = new ArtifactVersionCompleteRequest();
        request.setUploadSessionId(300L);
        request.setBaseVersionId(baseVersionId);
        request.setSourceRunId(900L);
        return request;
    }

    private ArtifactUploadSessionEntity session(Long baseVersionId) {
        ArtifactUploadSessionEntity session = new ArtifactUploadSessionEntity();
        session.setId(300L);
        session.setArtifactId(200L);
        session.setBaseVersionId(baseVersionId);
        session.setBucket("delivery-bucket");
        session.setCosKey("cos/key.md");
        session.setFileName("analysis.md");
        session.setExpectedSha256(HASH);
        session.setExpectedSize(1024L);
        session.setContentType("text/markdown");
        session.setStatus("CREATED");
        session.setExpireAt(LocalDateTime.now().plusMinutes(5));
        session.setCreatedBy(1L);
        return session;
    }

    private ArtifactEntity artifact(Long currentVersionId) {
        ArtifactEntity artifact = new ArtifactEntity();
        artifact.setId(200L);
        artifact.setRequirementPk(100L);
        artifact.setLogicalPath("docs/172014/prd/analysis.md");
        artifact.setKind("MARKDOWN");
        artifact.setStage("PRD");
        artifact.setCurrentVersionId(currentVersionId);
        artifact.setVersion(0L);
        return artifact;
    }

    private RequirementEntity requirement() {
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(100L);
        requirement.setProjectId(10L);
        requirement.setRequirementId("172014");
        requirement.setTitle("新增定位菜单装修组件");
        return requirement;
    }

    private ArtifactVersionEntity version(Long id, int versionNo, Long fileObjectId) {
        ArtifactVersionEntity version = new ArtifactVersionEntity();
        version.setId(id);
        version.setArtifactId(200L);
        version.setVersionNo(versionNo);
        version.setFileObjectId(fileObjectId);
        version.setStatus("CURRENT");
        version.setSourceRunId(900L);
        version.setCreatedBy(1L);
        return version;
    }

    private FileObjectEntity fileObject(Long id) {
        FileObjectEntity fileObject = new FileObjectEntity();
        fileObject.setId(id);
        fileObject.setBucket("delivery-bucket");
        fileObject.setCosKey("cos/key.md");
        fileObject.setCosVersionId("cos-version-0");
        fileObject.setSha256(HASH);
        fileObject.setSize(1024L);
        fileObject.setContentType("text/markdown");
        return fileObject;
    }
}
