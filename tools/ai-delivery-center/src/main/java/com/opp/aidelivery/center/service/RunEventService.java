package com.opp.aidelivery.center.service;

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
import java.util.List;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
@RequiredArgsConstructor
public class RunEventService {

    private final AiDeliveryCenterProperties properties;
    private final PermissionService permissionService;
    private final RunMapper runMapper;
    private final RequirementMapper requirementMapper;
    private final RunEventRepository runEventRepository;
    private final RealtimeEventBroker realtimeEventBroker;

    public RunEventVO append(Long userId, RunEventCreateRequest request) {
        RunEntity run = loadRunAndCheckPermission(userId, request.getRunId());
        RunEventEntity event = new RunEventEntity();
        event.setRunId(run.getId());
        event.setSeq(request.getSeq() == null ? runEventRepository.nextSeq(run.getId()) : request.getSeq());
        event.setLevel(normalizeLevel(request.getLevel()));
        event.setType(normalizeType(request.getType()));
        event.setTextObjectId(request.getTextObjectId());
        event.setPayloadJson(normalizePayload(request));
        event.setMessage(normalizeMessage(request));
        runEventRepository.append(event);
        realtimeEventBroker.broadcast(event);
        return toVO(event);
    }

    public List<RunEventVO> listAfter(Long userId, Long runId, long afterSeq) {
        loadRunAndCheckPermission(userId, runId);
        return runEventRepository.listAfterSeq(runId, afterSeq).stream()
            .map(this::toVO)
            .collect(Collectors.toList());
    }

    public SseEmitter subscribe(Long userId, Long runId) {
        loadRunAndCheckPermission(userId, runId);
        return realtimeEventBroker.subscribeRun(runId);
    }

    private RunEntity loadRunAndCheckPermission(Long userId, Long runId) {
        RunEntity run = runMapper.selectById(runId);
        if (run == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "运行记录不存在");
        }
        RequirementEntity requirement = requirementMapper.selectById(run.getRequirementPk());
        if (requirement == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "需求不存在");
        }
        permissionService.assertProjectMember(userId, requirement.getProjectId());
        return run;
    }

    private String normalizeLevel(String level) {
        if ("ERROR".equals(level) || "WARN".equals(level) || "DEBUG".equals(level)) {
            return level;
        }
        return "INFO";
    }

    private String normalizeType(String type) {
        if ("stdout".equals(type) || "stderr".equals(type) || "exit".equals(type) || "cancelled".equals(type)) {
            return type;
        }
        return "stdout";
    }

    private String normalizeMessage(RunEventCreateRequest request) {
        int maxLength = properties.getEvent().getInlineMessageMaxLength();
        String message = request.getMessage();
        if (message.length() <= maxLength) {
            return message;
        }
        if (request.getTextObjectId() == null) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "长日志需先上传 COS chunk 并传 textObjectId");
        }
        return message.substring(0, maxLength);
    }

    private String normalizePayload(RunEventCreateRequest request) {
        String payload = request.getPayloadJson();
        if (request.getMessage().length() <= properties.getEvent().getInlineMessageMaxLength()) {
            return payload;
        }
        String chunkPayload = "{\"chunked\":true,\"textObjectId\":" + request.getTextObjectId()
            + ",\"originalLength\":" + request.getMessage().length() + "}";
        if (payload == null || payload.trim().isEmpty()) {
            return chunkPayload;
        }
        return chunkPayload.substring(0, chunkPayload.length() - 1) + ",\"clientPayload\":" + quote(payload) + "}";
    }

    private String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private RunEventVO toVO(RunEventEntity event) {
        RunEventVO vo = new RunEventVO();
        vo.setId(event.getId());
        vo.setRunId(event.getRunId());
        vo.setSeq(event.getSeq());
        vo.setLevel(event.getLevel());
        vo.setType(event.getType());
        vo.setMessage(event.getMessage());
        vo.setTextObjectId(event.getTextObjectId());
        vo.setPayloadJson(event.getPayloadJson());
        vo.setCreatedAt(event.getCreatedAt());
        return vo;
    }
}
