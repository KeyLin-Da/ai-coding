package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.mapper.JobMapper;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.RunMapper;
import com.opp.aidelivery.center.model.dto.JobClaimRequest;
import com.opp.aidelivery.center.model.dto.JobCreateRequest;
import com.opp.aidelivery.center.model.dto.JobLeaseRequest;
import com.opp.aidelivery.center.model.entity.ClientSessionEntity;
import com.opp.aidelivery.center.model.entity.JobEntity;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.RunEntity;
import com.opp.aidelivery.center.model.vo.JobVO;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class JobServiceTest {

    @Mock
    private PermissionService permissionService;
    @Mock
    private ClientSessionService clientSessionService;
    @Mock
    private JobLeaseService jobLeaseService;
    @Mock
    private DomainEventService domainEventService;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private JobMapper jobMapper;
    @Mock
    private RunMapper runMapper;

    private AiDeliveryCenterProperties properties;
    private JobService jobService;

    @BeforeEach
    void setUp() {
        properties = new AiDeliveryCenterProperties();
        properties.getJob().setLeaseTtl(Duration.ofSeconds(60));
        jobService = new JobService(
            properties,
            permissionService,
            clientSessionService,
            jobLeaseService,
            domainEventService,
            requirementMapper,
            jobMapper,
            runMapper
        );
    }

    @Test
    void createJobStoresActionInputAsQueuedJob() {
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        doAnswer(invocation -> {
            JobEntity job = invocation.getArgument(0);
            job.setId(500L);
            return 1;
        }).when(jobMapper).insert(any(JobEntity.class));

        JobCreateRequest request = new JobCreateRequest();
        request.setRequirementPk(100L);
        request.setActionType("OPENSPEC_APPLY");
        request.setParamsJson("{\"changeName\":\"req-172014\"}");
        JobVO result = jobService.create(1L, request);

        assertThat(result.getId()).isEqualTo(500L);
        assertThat(result.getStatus()).isEqualTo("QUEUED");
        verify(permissionService).assertProjectMember(1L, 10L);
        verify(domainEventService).publishAfterCommit(eq(10L), eq("job.created"), eq("JOB"), eq(500L), any(String.class));
    }

    @Test
    void claimSkipsCapabilityMismatchAndClaimsEligibleJobWithRedisLease() {
        JobEntity openspecJob = queuedJob(501L, "OPENSPEC_APPLY");
        JobEntity reviewJob = queuedJob(502L, "CODE_REVIEW");
        when(clientSessionService.loadOwnedSession(1L, 10L)).thenReturn(session());
        when(jobMapper.selectList(any())).thenReturn(Arrays.asList(openspecJob, reviewJob));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(jobLeaseService.claim(502L, 10L)).thenReturn(true);
        doAnswer(invocation -> {
            RunEntity run = invocation.getArgument(0);
            run.setId(900L);
            return 1;
        }).when(runMapper).insert(any(RunEntity.class));

        JobClaimRequest request = new JobClaimRequest();
        request.setClientSessionId(10L);
        request.setCapabilities(Collections.singletonList("CODEX"));
        JobVO result = jobService.claim(1L, request);

        assertThat(result.getId()).isEqualTo(502L);
        assertThat(result.getRunId()).isEqualTo(900L);
        assertThat(reviewJob.getStatus()).isEqualTo("CLAIMED");
        verify(jobLeaseService, never()).claim(501L, 10L);
        verify(jobMapper).updateById(reviewJob);
    }

    @Test
    void claimByIdClaimsTheCreatedJobAndReturnsRunId() {
        JobEntity job = queuedJob(503L, "CODE_REVIEW");
        when(clientSessionService.loadOwnedSession(1L, 10L)).thenReturn(session());
        when(jobMapper.selectById(503L)).thenReturn(job);
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(jobLeaseService.claim(503L, 10L)).thenReturn(true);
        doAnswer(invocation -> {
            RunEntity run = invocation.getArgument(0);
            run.setId(901L);
            return 1;
        }).when(runMapper).insert(any(RunEntity.class));

        JobClaimRequest request = new JobClaimRequest();
        request.setClientSessionId(10L);
        request.setCapabilities(Collections.singletonList("CODEX"));

        JobVO result = jobService.claimById(1L, 503L, request);

        assertThat(result.getId()).isEqualTo(503L);
        assertThat(result.getRunId()).isEqualTo(901L);
        assertThat(job.getStatus()).isEqualTo("CLAIMED");
        verify(jobLeaseService).claim(503L, 10L);
        verify(jobMapper).updateById(job);
    }

    @Test
    void renewRejectsExpiredRedisLease() {
        JobEntity job = claimedJob();
        when(jobMapper.selectById(500L)).thenReturn(job);
        when(clientSessionService.loadOwnedSession(1L, 10L)).thenReturn(session());
        when(jobLeaseService.renew(500L, 10L)).thenReturn(false);

        JobLeaseRequest request = new JobLeaseRequest();
        request.setClientSessionId(10L);

        assertThatThrownBy(() -> jobService.renew(1L, 500L, request))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.JOB_LEASE_EXPIRED);
    }

    @Test
    void cancelMarksJobAndLatestRunCancelledAndReleasesLease() {
        JobEntity job = claimedJob();
        RunEntity run = run();
        when(jobMapper.selectById(500L)).thenReturn(job);
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(runMapper.selectOne(any())).thenReturn(run);

        JobVO result = jobService.cancel(1L, 500L);

        assertThat(result.getStatus()).isEqualTo("CANCELLED");
        assertThat(run.getStatus()).isEqualTo("CANCELLED");
        verify(jobLeaseService).release(500L, 10L);
        verify(runMapper).updateById(run);
        verify(domainEventService).publishAfterCommit(eq(10L), eq("job.cancelled"), eq("JOB"), eq(500L), any(String.class));
    }

    @Test
    void completeIsIdempotentForSameClaimedClientAfterSuccess() {
        JobEntity job = claimedJob();
        job.setStatus("SUCCEEDED");
        RunEntity run = run();
        when(jobMapper.selectById(500L)).thenReturn(job);
        when(clientSessionService.loadOwnedSession(1L, 10L)).thenReturn(session());
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
        when(runMapper.selectOne(any())).thenReturn(run);

        JobLeaseRequest request = new JobLeaseRequest();
        request.setClientSessionId(10L);
        JobVO result = jobService.complete(1L, 500L, request);

        assertThat(result.getStatus()).isEqualTo("SUCCEEDED");
        verify(jobLeaseService, never()).isHolder(500L, 10L);
        verify(jobMapper, never()).updateById(any());
    }

    @Test
    void requeueExpiredLeasesReturnsClaimedJobToQueueForOfflineRecovery() {
        JobEntity job = claimedJob();
        job.setLeaseExpireAt(LocalDateTime.now().minusMinutes(1));
        job.setRetryTimes(0);
        when(jobMapper.selectList(any())).thenReturn(Collections.singletonList(job));
        when(requirementMapper.selectById(100L)).thenReturn(requirement());

        int count = jobService.requeueExpiredLeases();

        assertThat(count).isEqualTo(1);
        assertThat(job.getStatus()).isEqualTo("QUEUED");
        assertThat(job.getClaimedBy()).isNull();
        assertThat(job.getRetryTimes()).isEqualTo(1);
        verify(jobMapper).updateById(job);
        verify(domainEventService).publishAfterCommit(eq(10L), eq("job.lease.expired"), eq("JOB"), eq(500L), any(String.class));
    }

    private JobEntity queuedJob(Long id, String actionType) {
        JobEntity job = new JobEntity();
        job.setId(id);
        job.setRequirementPk(100L);
        job.setActionType(actionType);
        job.setStatus("QUEUED");
        job.setRetryTimes(0);
        return job;
    }

    private JobEntity claimedJob() {
        JobEntity job = queuedJob(500L, "OPENSPEC_APPLY");
        job.setStatus("CLAIMED");
        job.setClaimedBy(10L);
        job.setLeaseExpireAt(LocalDateTime.now().plusMinutes(1));
        return job;
    }

    private ClientSessionEntity session() {
        ClientSessionEntity session = new ClientSessionEntity();
        session.setId(10L);
        session.setUserId(1L);
        session.setOsType("MACOS");
        session.setCapabilities("[\"CODEX\",\"OPENSPEC\",\"GIT\"]");
        session.setStatus("ONLINE");
        return session;
    }

    private RequirementEntity requirement() {
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(100L);
        requirement.setProjectId(10L);
        requirement.setRequirementId("172014");
        return requirement;
    }

    private RunEntity run() {
        RunEntity run = new RunEntity();
        run.setId(900L);
        run.setJobId(500L);
        run.setRequirementPk(100L);
        run.setClientSessionId(10L);
        run.setStatus("RUNNING");
        return run;
    }
}
