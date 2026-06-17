package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.TechDesignAnnotationMapper;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationAnchorRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationConsumeRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationCreateRequest;
import com.opp.aidelivery.center.model.dto.TechDesignAnnotationStatusRequest;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.TechDesignAnnotationEntity;
import com.opp.aidelivery.center.model.vo.TechDesignAnnotationVO;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TechDesignAnnotationServiceTest {

    @Mock
    private PermissionService permissionService;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private TechDesignAnnotationMapper annotationMapper;
    @Mock
    private DomainEventService domainEventService;

    private TechDesignAnnotationService service;

    @BeforeEach
    void setUp() {
        service = new TechDesignAnnotationService(
            permissionService,
            requirementMapper,
            annotationMapper,
            domainEventService,
            new ObjectMapper()
        );
    }

    @Test
    void createPersistsAnnotationAndPublishesEvent() {
        AtomicReference<TechDesignAnnotationEntity> inserted = new AtomicReference<>();
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        org.mockito.Mockito.doAnswer(invocation -> {
            TechDesignAnnotationEntity entity = invocation.getArgument(0);
            entity.setId(900L);
            inserted.set(entity);
            return 1;
        }).when(annotationMapper).insert(any(TechDesignAnnotationEntity.class));
        when(annotationMapper.selectList(any())).thenAnswer(invocation -> Collections.singletonList(inserted.get()));

        List<TechDesignAnnotationVO> result = service.create(1L, 100L, createRequest());

        assertThat(result).hasSize(1);
        assertThat(inserted.get().getRequirementPk()).isEqualTo(100L);
        assertThat(inserted.get().getVersionId()).isEqualTo("current");
        assertThat(inserted.get().getStatus()).isEqualTo("OPEN");
        assertThat(inserted.get().getIncludeInNextGeneration()).isEqualTo(1);
        verify(permissionService, atLeastOnce()).assertProjectMember(1L, 10L);
        verify(domainEventService).publishAfterCommit(eq(10L), eq("tech-design.annotation.changed"), eq("REQUIREMENT"), eq(100L), anyString());
    }

    @Test
    void updateStatusChangesStatusAndPublishesEvent() {
        TechDesignAnnotationEntity entity = annotation();
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(annotationMapper.selectOne(any())).thenReturn(entity);
        when(annotationMapper.selectList(any())).thenReturn(Collections.singletonList(entity));
        TechDesignAnnotationStatusRequest request = new TechDesignAnnotationStatusRequest();
        request.setStatus("RESOLVED");
        request.setIncludeInNextGeneration(false);

        List<TechDesignAnnotationVO> result = service.updateStatus(1L, 100L, "annotation-1", request);

        assertThat(entity.getStatus()).isEqualTo("RESOLVED");
        assertThat(entity.getIncludeInNextGeneration()).isEqualTo(0);
        assertThat(result.get(0).getStatus()).isEqualTo("RESOLVED");
        verify(annotationMapper).updateById(entity);
        verify(domainEventService).publishAfterCommit(eq(10L), eq("tech-design.annotation.changed"), eq("REQUIREMENT"), eq(100L), anyString());
    }

    @Test
    void deleteRemovesAnnotationAndPublishesEvent() {
        TechDesignAnnotationEntity entity = annotation();
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(annotationMapper.selectOne(any())).thenReturn(entity);
        when(annotationMapper.selectList(any())).thenReturn(Collections.emptyList());

        List<TechDesignAnnotationVO> result = service.delete(1L, 100L, "annotation-1");

        assertThat(result).isEmpty();
        verify(annotationMapper).deleteById(900L);
        verify(domainEventService).publishAfterCommit(eq(10L), eq("tech-design.annotation.changed"), eq("REQUIREMENT"), eq(100L), anyString());
    }

    @Test
    void consumeMarksConsumableAnnotationsAndPublishesEvent() {
        TechDesignAnnotationEntity entity = annotation();
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(annotationMapper.selectList(any())).thenReturn(Collections.singletonList(entity));
        TechDesignAnnotationConsumeRequest request = new TechDesignAnnotationConsumeRequest();
        request.setRunId("run-design-1");

        List<TechDesignAnnotationVO> result = service.consume(1L, 100L, request);

        assertThat(result).hasSize(1);
        assertThat(entity.getConsumedAt()).isNotNull();
        assertThat(entity.getConsumedRunId()).isEqualTo("run-design-1");
        verify(annotationMapper).updateById(entity);
        ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
        verify(domainEventService).publishAfterCommit(eq(10L), eq("tech-design.annotation.changed"), eq("REQUIREMENT"), eq(100L), payloadCaptor.capture());
        assertThat(payloadCaptor.getValue()).contains("\"operation\":\"CONSUMED\"");
    }

    private TechDesignAnnotationCreateRequest createRequest() {
        TechDesignAnnotationAnchorRequest anchor = new TechDesignAnnotationAnchorRequest();
        anchor.setPlainStart(7);
        anchor.setPlainEnd(15);
        anchor.setPrefixText("技术方案");
        anchor.setSuffixText("。");
        anchor.setHeadingPath(Collections.singletonList("技术方案"));
        anchor.setOccurrence(1);

        TechDesignAnnotationCreateRequest request = new TechDesignAnnotationCreateRequest();
        request.setArtifactPath("docs/172014/technical-design/design_review.md");
        request.setVersionId("current");
        request.setVersionSource("CURRENT_DRAFT");
        request.setContentHash("tech-hash");
        request.setSelectedText("需要补充缓存策略");
        request.setComment("补充 Redis key 和过期时间");
        request.setIncludeInNextGeneration(true);
        request.setAnchor(anchor);
        return request;
    }

    private RequirementEntity requirement() {
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(100L);
        requirement.setProjectId(10L);
        requirement.setRequirementId("172014");
        return requirement;
    }

    private TechDesignAnnotationEntity annotation() {
        TechDesignAnnotationEntity entity = new TechDesignAnnotationEntity();
        entity.setId(900L);
        entity.setRequirementPk(100L);
        entity.setAnnotationUid("annotation-1");
        entity.setArtifactPath("docs/172014/technical-design/design_review.md");
        entity.setVersionId("current");
        entity.setVersionSource("CURRENT_DRAFT");
        entity.setContentHash("tech-hash");
        entity.setSelectedText("需要补充缓存策略");
        entity.setCommentText("补充 Redis key 和过期时间");
        entity.setPlainStart(7);
        entity.setPlainEnd(15);
        entity.setPrefixText("技术方案");
        entity.setSuffixText("。");
        entity.setHeadingPathJson("[\"技术方案\"]");
        entity.setOccurrence(1);
        entity.setStatus("OPEN");
        entity.setIncludeInNextGeneration(1);
        return entity;
    }
}
