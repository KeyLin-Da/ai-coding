package com.opp.aidelivery.center.service;

import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.model.dto.PreflightRequest;
import com.opp.aidelivery.center.model.vo.PreflightCheckVO;
import com.opp.aidelivery.center.model.vo.PreflightResultVO;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class PreflightService {

    private static final Set<String> DEFAULT_CHECKS = new HashSet<>(Arrays.asList("CENTER", "PROJECT_PERMISSION", "DB", "REDIS", "WEBSOCKET"));

    private final AiDeliveryCenterProperties properties;
    private final PermissionService permissionService;
    private final JdbcTemplate jdbcTemplate;
    private final StringRedisTemplate redisTemplate;

    public PreflightResultVO check(Long userId, PreflightRequest request) {
        Set<String> requested = normalizeChecks(request);
        PreflightResultVO result = new PreflightResultVO();
        if (requested.contains("CENTER")) {
            result.getChecks().add(pass("CENTER", "center service reachable"));
        }
        if (requested.contains("PROJECT_PERMISSION")) {
            result.getChecks().add(checkProjectPermission(userId, request.getProjectId()));
        }
        if (requested.contains("DB")) {
            result.getChecks().add(checkDb());
        }
        if (requested.contains("REDIS")) {
            result.getChecks().add(checkRedis(request.getProjectId()));
        }
        if (requested.contains("WEBSOCKET")) {
            result.getChecks().add(checkWebSocket());
        }
        result.setOverallStatus(overallStatus(result));
        return result;
    }

    private PreflightCheckVO checkProjectPermission(Long userId, Long projectId) {
        try {
            permissionService.assertProjectMember(userId, projectId);
            return pass("PROJECT_PERMISSION", "project permission ok");
        } catch (BusinessException ex) {
            PreflightCheckVO vo = fail("PROJECT_PERMISSION", ex.getMessage());
            vo.getDetails().put("errorCode", ex.getErrorCode().getCode());
            return vo;
        }
    }

    private PreflightCheckVO checkDb() {
        try {
            PreflightCheckVO vo = pass("DB", "schema ready");
            for (String table : Arrays.asList(
                "ad_import_session",
                "ad_import_item",
                "ad_artifact_git_version",
                "ad_artifact_sync",
                "ad_project_repository",
                "ad_user_project_repo_state"
            )) {
                if (!existsInInformationSchema("tables", "table_name", table)) {
                    return fail("DB", "missing table: " + table);
                }
            }
            if (!existsInInformationSchema("columns", "column_name", "content_sha256")) {
                return fail("DB", "missing git artifact content hash column");
            }
            if (!existsInInformationSchema("statistics", "index_name", "idx_content_hash")) {
                return fail("DB", "missing git artifact content hash index");
            }
            vo.getDetails().put("requiredTables", Arrays.asList(
                "ad_import_session",
                "ad_import_item",
                "ad_artifact_git_version",
                "ad_artifact_sync",
                "ad_project_repository",
                "ad_user_project_repo_state"
            ));
            vo.getDetails().put("requiredIndex", "idx_content_hash");
            return vo;
        } catch (DataAccessException ex) {
            return fail("DB", ex.getMessage());
        }
    }

    private boolean existsInInformationSchema(String table, String field, String value) {
        String sql = "SELECT COUNT(*) FROM information_schema." + table + " WHERE table_schema = DATABASE() AND " + field + " = ?";
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, value);
        return count != null && count > 0;
    }

    private PreflightCheckVO checkRedis(Long projectId) {
        String requestId = UUID.randomUUID().toString();
        String key = properties.getRedis().getKeyPrefix() + ":preflight:" + requestId;
        try {
            redisTemplate.opsForValue().set(key, String.valueOf(projectId));
            String value = redisTemplate.opsForValue().get(key);
            redisTemplate.delete(key);
            if (!String.valueOf(projectId).equals(value)) {
                return redisFailure("redis roundtrip failed");
            }
            PreflightCheckVO vo = pass("REDIS", "redis runtime namespace ready");
            vo.getDetails().put("eventChannel", properties.getWebsocket().getRedisChannelPrefix() + ":" + projectId);
            vo.getDetails().put("leasePrefix", properties.getRedis().getKeyPrefix() + ":job");
            return vo;
        } catch (RuntimeException ex) {
            return redisFailure(ex.getMessage());
        }
    }

    private PreflightCheckVO redisFailure(String message) {
        boolean required = properties.getWebsocket().isRedisRequired() || "redis".equalsIgnoreCase(properties.getWebsocket().getBroker());
        PreflightCheckVO vo = required ? fail("REDIS", message) : warn("REDIS", message);
        vo.getDetails().put("required", required);
        return vo;
    }

    private PreflightCheckVO checkWebSocket() {
        PreflightCheckVO vo = pass("WEBSOCKET", "websocket endpoint configured");
        vo.getDetails().put("endpoint", properties.getWebsocket().getEndpoint());
        vo.getDetails().put("broker", properties.getWebsocket().getBroker());
        return vo;
    }

    private Set<String> normalizeChecks(PreflightRequest request) {
        if (request.getChecks() == null || request.getChecks().isEmpty()) {
            return DEFAULT_CHECKS;
        }
        return request.getChecks().stream()
            .filter(StringUtils::hasText)
            .map(item -> item.trim().toUpperCase(Locale.ROOT))
            .collect(Collectors.toSet());
    }

    private String overallStatus(PreflightResultVO result) {
        if (result.getChecks().stream().anyMatch(item -> "FAIL".equals(item.getStatus()))) {
            return "FAIL";
        }
        if (result.getChecks().stream().anyMatch(item -> "WARN".equals(item.getStatus()))) {
            return "WARN";
        }
        return "PASS";
    }

    private PreflightCheckVO pass(String name, String message) {
        return check(name, "PASS", message);
    }

    private PreflightCheckVO warn(String name, String message) {
        return check(name, "WARN", message);
    }

    private PreflightCheckVO fail(String name, String message) {
        return check(name, "FAIL", message);
    }

    private PreflightCheckVO check(String name, String status, String message) {
        PreflightCheckVO vo = new PreflightCheckVO();
        vo.setName(name);
        vo.setStatus(status);
        vo.setMessage(message);
        return vo;
    }

}
