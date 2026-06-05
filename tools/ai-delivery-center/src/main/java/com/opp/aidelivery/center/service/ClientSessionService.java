package com.opp.aidelivery.center.service;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.ClientSessionMapper;
import com.opp.aidelivery.center.model.dto.ClientSessionHeartbeatRequest;
import com.opp.aidelivery.center.model.dto.ClientSessionRegisterRequest;
import com.opp.aidelivery.center.model.entity.ClientSessionEntity;
import com.opp.aidelivery.center.model.vo.ClientSessionVO;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ClientSessionService {

    private final ClientSessionMapper clientSessionMapper;

    @Transactional(rollbackFor = Exception.class)
    public ClientSessionVO register(Long userId, ClientSessionRegisterRequest request) {
        ClientSessionEntity session = new ClientSessionEntity();
        session.setUserId(userId);
        session.setOsType(normalizeOsType(request.getOsType()));
        session.setCapabilities(toCapabilityJson(request.getCapabilities()));
        session.setStatus("ONLINE");
        session.setLastHeartbeatAt(LocalDateTime.now());
        clientSessionMapper.insert(session);
        return toVO(session);
    }

    @Transactional(rollbackFor = Exception.class)
    public ClientSessionVO heartbeat(Long userId, Long clientSessionId, ClientSessionHeartbeatRequest request) {
        ClientSessionEntity session = loadOwnedSession(userId, clientSessionId);
        session.setStatus("ONLINE");
        session.setLastHeartbeatAt(LocalDateTime.now());
        if (request.getCapabilities() != null && !request.getCapabilities().isEmpty()) {
            session.setCapabilities(toCapabilityJson(request.getCapabilities()));
        }
        clientSessionMapper.updateById(session);
        return toVO(session);
    }

    ClientSessionEntity loadOwnedSession(Long userId, Long clientSessionId) {
        ClientSessionEntity session = clientSessionMapper.selectById(clientSessionId);
        if (session == null) {
            throw new BusinessException(AiDeliveryErrorCode.RESOURCE_NOT_FOUND, "客户端会话不存在");
        }
        if (!userId.equals(session.getUserId())) {
            throw new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED, "客户端会话不属于当前用户");
        }
        return session;
    }

    String toCapabilityJson(List<String> capabilities) {
        if (capabilities == null) {
            return "[]";
        }
        return capabilities.stream()
            .map(this::normalizeCapability)
            .distinct()
            .map(item -> "\"" + item + "\"")
            .collect(Collectors.joining(",", "[", "]"));
    }

    private String normalizeCapability(String capability) {
        String value = capability == null ? "" : capability.trim().toUpperCase(Locale.ROOT);
        if (!value.matches("[A-Z0-9_-]{1,64}")) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "客户端能力只能是非敏感摘要标识");
        }
        return value;
    }

    private String normalizeOsType(String osType) {
        String value = osType == null ? "" : osType.trim().toUpperCase(Locale.ROOT);
        if ("MAC".equals(value) || "MACOS".equals(value) || "DARWIN".equals(value)) {
            return "MACOS";
        }
        if ("WIN".equals(value) || "WINDOWS".equals(value)) {
            return "WINDOWS";
        }
        if ("LINUX".equals(value)) {
            return "LINUX";
        }
        return "OTHER";
    }

    private ClientSessionVO toVO(ClientSessionEntity session) {
        ClientSessionVO vo = new ClientSessionVO();
        vo.setId(session.getId());
        vo.setUserId(session.getUserId());
        vo.setOsType(session.getOsType());
        vo.setCapabilities(session.getCapabilities());
        vo.setStatus(session.getStatus());
        vo.setLastHeartbeatAt(session.getLastHeartbeatAt());
        return vo;
    }
}
