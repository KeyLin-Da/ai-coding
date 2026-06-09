package com.opp.aidelivery.center.service;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.model.dto.PreflightRequest;
import com.opp.aidelivery.center.model.vo.PreflightCheckVO;
import com.opp.aidelivery.center.model.vo.PreflightResultVO;
import com.opp.aidelivery.center.storage.StorageObjectMetadata;
import com.opp.aidelivery.center.storage.StorageService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
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

    private static final Set<String> DEFAULT_CHECKS = new HashSet<>(Arrays.asList("CENTER", "PROJECT_PERMISSION", "DB", "REDIS", "COS", "WEBSOCKET"));

    private final AiDeliveryCenterProperties properties;
    private final PermissionService permissionService;
    private final JdbcTemplate jdbcTemplate;
    private final StringRedisTemplate redisTemplate;
    private final StorageService storageService;

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
        if (requested.contains("COS")) {
            result.getChecks().add(checkCos(Boolean.TRUE.equals(request.getTestObjectStorage())));
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
            for (String table : Arrays.asList("ad_import_session", "ad_import_item")) {
                if (!existsInInformationSchema("tables", "table_name", table)) {
                    return fail("DB", "missing table: " + table);
                }
            }
            if (!existsInInformationSchema("columns", "column_name", "content_sha256")) {
                return fail("DB", "missing artifact version content hash column");
            }
            if (!existsInInformationSchema("statistics", "index_name", "idx_artifact_content_hash")) {
                return fail("DB", "missing artifact content hash index");
            }
            vo.getDetails().put("requiredTables", Arrays.asList("ad_import_session", "ad_import_item"));
            vo.getDetails().put("requiredIndex", "idx_artifact_content_hash");
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

    private PreflightCheckVO checkCos(boolean testObjectStorage) {
        if (!StringUtils.hasText(properties.getCos().getBucket())) {
            return fail("COS", "cos bucket is empty");
        }
        if (!properties.getPreflight().isObjectStorageTestEnabled() || !testObjectStorage) {
            PreflightCheckVO vo = pass("COS", "cos configuration present");
            vo.getDetails().put("bucket", properties.getCos().getBucket());
            vo.getDetails().put("testObjectStorage", false);
            return vo;
        }
        byte[] content = ("ai-delivery-preflight-" + UUID.randomUUID()).getBytes(StandardCharsets.UTF_8);
        String sha256 = sha256(content);
        String key = "preflight/" + UUID.randomUUID() + ".txt";
        try {
            storageService.putObject(key, content, "text/plain", sha256);
            StorageObjectMetadata metadata = storageService.getObjectMetadata(key);
            if (metadata.getSize() != content.length || (metadata.getSha256() != null && !metadata.getSha256().equalsIgnoreCase(sha256))) {
                return fail("COS", "cos metadata mismatch");
            }
            PreflightCheckVO vo = pass("COS", "cos upload flow ready");
            vo.getDetails().put("bucket", properties.getCos().getBucket());
            vo.getDetails().put("objectKey", key);
            return vo;
        } catch (RuntimeException ex) {
            return fail("COS", ex.getMessage());
        } finally {
            try {
                storageService.deleteObject(key);
            } catch (RuntimeException ignored) {
                // Preflight cleanup failure is not a separate blocking fact.
            }
        }
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

    private String sha256(byte[] content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(content);
            StringBuilder builder = new StringBuilder();
            for (byte item : bytes) {
                builder.append(String.format("%02x", item));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new BusinessException(AiDeliveryErrorCode.INTERNAL_ERROR, ex.getMessage());
        }
    }
}
