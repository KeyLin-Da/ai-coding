package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.mapper.RequirementMapper;
import com.opp.aidelivery.center.mapper.RunMapper;
import com.opp.aidelivery.center.model.dto.RunEventCreateRequest;
import com.opp.aidelivery.center.model.entity.RequirementEntity;
import com.opp.aidelivery.center.model.entity.RunEntity;
import com.opp.aidelivery.center.model.entity.RunEventEntity;
import com.opp.aidelivery.center.model.vo.RunEventVO;
import com.opp.aidelivery.center.repository.RunEventRepository;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RunEventServiceTest {

    @Mock
    private PermissionService permissionService;
    @Mock
    private RunMapper runMapper;
    @Mock
    private RequirementMapper requirementMapper;
    @Mock
    private RunEventRepository runEventRepository;
    @Mock
    private RealtimeEventBroker realtimeEventBroker;

    private AiDeliveryCenterProperties properties;
    private RunEventService runEventService;

    @BeforeEach
    void setUp() {
        properties = new AiDeliveryCenterProperties();
        properties.getEvent().setInlineMessageMaxLength(8);
        runEventService = new RunEventService(properties, permissionService, runMapper, requirementMapper, runEventRepository, realtimeEventBroker);
    }

    @Test
    void appendAssignsNextSeqAndBroadcastsRunEvent() {
        stubAuthorizedRun();
        when(runEventRepository.nextSeq(700L)).thenReturn(3L);
        doAnswer(invocation -> {
            RunEventEntity event = invocation.getArgument(0);
            event.setId(1000L);
            return event;
        }).when(runEventRepository).append(any(RunEventEntity.class));

        RunEventVO result = runEventService.append(1L, request("stdout", "hello"));

        assertThat(result.getSeq()).isEqualTo(3L);
        assertThat(result.getMessage()).isEqualTo("hello");
        verify(realtimeEventBroker).broadcast(any(RunEventEntity.class));
    }

    @Test
    void appendLongTranscriptStoresTruncatedSummary() {
        // 验证 Git-only 后长日志不再要求 COS chunk，只保存截断摘要和 payload 标记。
        stubAuthorizedRun();
        when(runEventRepository.nextSeq(700L)).thenReturn(4L);
        doAnswer(invocation -> invocation.getArgument(0)).when(runEventRepository).append(any(RunEventEntity.class));
        RunEventCreateRequest request = request("stdout", "0123456789ABC");

        RunEventVO result = runEventService.append(1L, request);

        assertThat(result.getMessage()).isEqualTo("01234567");
        assertThat(result.getPayloadJson()).contains("\"truncated\":true");
        assertThat(result.getPayloadJson()).contains("\"originalLength\":13");
    }

    @Test
    void listAfterReturnsRunEventsInSeqOrder() {
        stubAuthorizedRun();
        when(runEventRepository.listAfterSeq(700L, 1L)).thenReturn(Arrays.asList(runEvent(2L), runEvent(3L)));

        List<RunEventVO> result = runEventService.listAfter(1L, 700L, 1L);

        assertThat(result).extracting("seq").containsExactly(2L, 3L);
    }

    @Test
    void appendRejectsUnauthorizedRunBeforeWritingEvent() {
        stubRunAndRequirement();
        org.mockito.Mockito.doThrow(new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED))
            .when(permissionService).assertProjectMember(2L, 10L);

        assertThatThrownBy(() -> runEventService.append(2L, request("stderr", "oops")))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.ACCESS_DENIED);

        verify(runEventRepository, never()).append(any());
        verify(realtimeEventBroker, never()).broadcast(any(RunEventEntity.class));
    }

    @Test
    void appendUsesClientProvidedSeqWhenPresent() {
        stubAuthorizedRun();
        doAnswer(invocation -> invocation.getArgument(0)).when(runEventRepository).append(any(RunEventEntity.class));
        RunEventCreateRequest request = request("exit", "done");
        request.setSeq(99L);

        runEventService.append(1L, request);

        ArgumentCaptor<RunEventEntity> captor = ArgumentCaptor.forClass(RunEventEntity.class);
        verify(runEventRepository).append(captor.capture());
        assertThat(captor.getValue().getSeq()).isEqualTo(99L);
        verify(runEventRepository, never()).nextSeq(anyLong());
    }

    private void stubAuthorizedRun() {
        stubRunAndRequirement();
    }

    private void stubRunAndRequirement() {
        when(runMapper.selectById(700L)).thenReturn(run());
        when(requirementMapper.selectById(100L)).thenReturn(requirement());
    }

    private RunEventCreateRequest request(String type, String message) {
        RunEventCreateRequest request = new RunEventCreateRequest();
        request.setRunId(700L);
        request.setLevel("INFO");
        request.setType(type);
        request.setMessage(message);
        return request;
    }

    private RunEntity run() {
        RunEntity run = new RunEntity();
        run.setId(700L);
        run.setRequirementPk(100L);
        run.setStatus("RUNNING");
        return run;
    }

    private RequirementEntity requirement() {
        RequirementEntity requirement = new RequirementEntity();
        requirement.setId(100L);
        requirement.setProjectId(10L);
        requirement.setRequirementId("172014");
        return requirement;
    }

    private RunEventEntity runEvent(Long seq) {
        RunEventEntity event = new RunEventEntity();
        event.setId(seq);
        event.setRunId(700L);
        event.setSeq(seq);
        event.setLevel("INFO");
        event.setType("stdout");
        event.setMessage("line " + seq);
        return event;
    }
}
