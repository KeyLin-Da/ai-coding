package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.config.AiDeliveryCenterProperties;
import com.opp.aidelivery.center.model.dto.PreflightRequest;
import com.opp.aidelivery.center.model.entity.ProjectEntity;
import com.opp.aidelivery.center.model.vo.PreflightResultVO;
import com.opp.aidelivery.center.storage.StorageObjectMetadata;
import com.opp.aidelivery.center.storage.StorageService;
import java.util.Arrays;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class PreflightServiceTest {

    @Mock
    private PermissionService permissionService;
    @Mock
    private JdbcTemplate jdbcTemplate;
    @Mock
    private StringRedisTemplate redisTemplate;
    @Mock
    private ValueOperations<String, String> valueOperations;
    @Mock
    private StorageService storageService;

    private AiDeliveryCenterProperties properties;
    private PreflightService preflightService;

    @BeforeEach
    void setUp() {
        properties = new AiDeliveryCenterProperties();
        properties.getCos().setBucket("delivery-bucket");
        properties.getRedis().setKeyPrefix("ai-delivery");
        preflightService = new PreflightService(properties, permissionService, jdbcTemplate, redisTemplate, storageService);
    }

    @Test
    void preflightPassesProjectPermissionForAuthorizedUser() {
        // 验证中心服务会在导入前检查用户是否有项目权限。
        when(permissionService.assertProjectMember(1L, 10L)).thenReturn(project());
        PreflightRequest request = request("PROJECT_PERMISSION");

        PreflightResultVO result = preflightService.check(1L, request);

        assertThat(result.getOverallStatus()).isEqualTo("PASS");
        assertThat(result.getChecks().get(0).getName()).isEqualTo("PROJECT_PERMISSION");
    }

    @Test
    void preflightReportsPermissionFailureAsBlocking() {
        // 验证项目权限缺失是阻断项，初始化脚本不能继续导入。
        doThrow(new BusinessException(AiDeliveryErrorCode.ACCESS_DENIED, "无权限")).when(permissionService).assertProjectMember(1L, 10L);
        PreflightRequest request = request("PROJECT_PERMISSION");

        PreflightResultVO result = preflightService.check(1L, request);

        assertThat(result.getOverallStatus()).isEqualTo("FAIL");
        assertThat(result.getChecks().get(0).getStatus()).isEqualTo("FAIL");
    }

    @Test
    void preflightReportsMissingDatabaseCapability() {
        // 验证导入表或 hash 索引缺失时，DB 预检会阻断初始化导入。
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), any())).thenReturn(0);
        PreflightRequest request = request("DB");

        PreflightResultVO result = preflightService.check(1L, request);

        assertThat(result.getOverallStatus()).isEqualTo("FAIL");
        assertThat(result.getChecks().get(0).getMessage()).contains("missing table");
    }

    @Test
    void preflightReportsRedisWarnForSingleInstance() {
        // 验证单实例部署 Redis 不可用时仅降级为 WARN，不把 Redis 当事实源。
        when(redisTemplate.opsForValue()).thenThrow(new RuntimeException("redis down"));
        PreflightRequest request = request("REDIS");

        PreflightResultVO result = preflightService.check(1L, request);

        assertThat(result.getOverallStatus()).isEqualTo("WARN");
        assertThat(result.getChecks().get(0).getStatus()).isEqualTo("WARN");
    }

    @Test
    void preflightReportsRedisFailWhenClusterRequiresRedis() {
        // 验证多实例或 Redis broker 配置下 Redis 不可用会阻断协作运行态。
        properties.getWebsocket().setRedisRequired(true);
        when(redisTemplate.opsForValue()).thenThrow(new RuntimeException("redis down"));
        PreflightRequest request = request("REDIS");

        PreflightResultVO result = preflightService.check(1L, request);

        assertThat(result.getOverallStatus()).isEqualTo("FAIL");
    }

    @Test
    void preflightChecksCosUploadMetadata() {
        // 验证 COS 小文件写入与 metadata 校验成功后，预检返回 PASS。
        when(storageService.getObjectMetadata(anyString())).thenReturn(new StorageObjectMetadata(null, 58L, "text/plain", null));
        PreflightRequest request = request("COS");

        PreflightResultVO result = preflightService.check(1L, request);

        assertThat(result.getOverallStatus()).isEqualTo("PASS");
    }

    private PreflightRequest request(String check) {
        PreflightRequest request = new PreflightRequest();
        request.setProjectId(10L);
        request.setChecks(Arrays.asList(check));
        return request;
    }

    private ProjectEntity project() {
        ProjectEntity project = new ProjectEntity();
        project.setId(10L);
        project.setTeamId(20L);
        return project;
    }
}
