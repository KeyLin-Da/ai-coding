package com.opp.aidelivery.center.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.annotation.Version;
import com.opp.aidelivery.center.mapper.ArtifactMapper;
import com.opp.aidelivery.center.mapper.DomainEventMapper;
import com.opp.aidelivery.center.mapper.RunEventMapper;
import com.opp.aidelivery.center.model.entity.ArtifactEntity;
import com.opp.aidelivery.center.model.entity.DomainEventEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.RunEventEntity;
import com.opp.aidelivery.center.model.entity.WorkflowStageEntity;
import java.lang.reflect.Field;
import java.util.Collections;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RepositoryContractTest {

    @Mock
    private ArtifactMapper artifactMapper;
    @Mock
    private RunEventMapper runEventMapper;
    @Mock
    private DomainEventMapper domainEventMapper;

    @Test
    void workflowEntitiesUseOptimisticVersionFields() throws NoSuchFieldException {
        Field requirementVersion = RequirementEntity.class.getDeclaredField("version");
        Field stageVersion = WorkflowStageEntity.class.getDeclaredField("version");

        assertThat(requirementVersion.getAnnotation(Version.class)).isNotNull();
        assertThat(stageVersion.getAnnotation(Version.class)).isNotNull();
    }

    @Test
    void artifactCurrentVersionUpdateDelegatesToOptimisticMapperUpdate() {
        ArtifactRepository repository = new ArtifactRepository(artifactMapper);
        ArtifactEntity artifact = new ArtifactEntity();
        artifact.setId(11L);
        artifact.setVersion(3L);
        when(artifactMapper.updateById(any(ArtifactEntity.class))).thenReturn(1);

        boolean updated = repository.updateCurrentVersion(artifact, 99L);

        assertThat(updated).isTrue();
        assertThat(artifact.getCurrentVersionId()).isEqualTo(99L);
        verify(artifactMapper).updateById(artifact);
    }

    @Test
    void runEventRepositoryQueriesEventsAfterSequenceInOrder() {
        RunEventRepository repository = new RunEventRepository(runEventMapper);
        when(runEventMapper.selectList(any())).thenReturn(Collections.emptyList());

        repository.listAfterSeq(7L, 100L);

        verify(runEventMapper).selectList(any());
    }

    @Test
    void runEventAppendKeepsCallerProvidedSequence() {
        RunEventRepository repository = new RunEventRepository(runEventMapper);
        RunEventEntity event = new RunEventEntity();
        event.setRunId(7L);
        event.setSeq(101L);
        event.setLevel("INFO");
        event.setType("STDOUT");
        event.setMessage("chunk");

        repository.append(event);

        ArgumentCaptor<RunEventEntity> captor = ArgumentCaptor.forClass(RunEventEntity.class);
        verify(runEventMapper).insert(captor.capture());
        assertThat(captor.getValue().getSeq()).isEqualTo(101L);
    }

    @Test
    void domainEventRepositoryQueriesEventsAfterLastSeenEventId() {
        DomainEventRepository repository = new DomainEventRepository(domainEventMapper);
        when(domainEventMapper.selectList(any())).thenReturn(Collections.emptyList());

        repository.listAfterEventId(5L, 1008L, 500);

        verify(domainEventMapper).selectList(any());
    }

    @Test
    void domainEventSavePersistsMonotonicEventIdProvidedByService() {
        DomainEventRepository repository = new DomainEventRepository(domainEventMapper);
        DomainEventEntity event = new DomainEventEntity();
        event.setProjectId(5L);
        event.setEventId(1009L);
        event.setEventType("artifact.version.created");
        event.setAggregateType("ARTIFACT");
        event.setAggregateId(8L);
        event.setPayloadJson("{}");

        repository.save(event);

        ArgumentCaptor<DomainEventEntity> captor = ArgumentCaptor.forClass(DomainEventEntity.class);
        verify(domainEventMapper).insert(captor.capture());
        assertThat(captor.getValue().getEventId()).isEqualTo(1009L);
    }
}
