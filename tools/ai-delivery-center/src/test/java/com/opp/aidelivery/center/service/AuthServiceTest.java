package com.opp.aidelivery.center.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.UserMapper;
import com.opp.aidelivery.center.mapper.UserSessionMapper;
import com.opp.aidelivery.center.model.AiDeliveryConstants;
import com.opp.aidelivery.center.model.dto.AuthLoginRequest;
import com.opp.aidelivery.center.model.dto.AuthRegisterRequest;
import com.opp.aidelivery.center.model.entity.UserEntity;
import com.opp.aidelivery.center.model.entity.UserSessionEntity;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserMapper userMapper;
    @Mock
    private UserSessionMapper userSessionMapper;

    private AuthService authService;

    @BeforeEach
    void setUp() {
        authService = new AuthService(userMapper, userSessionMapper);
    }

    @Test
    void registerCreatesActiveUserAndOneDaySession() {
        // 验证首次创建账号时，会同时创建 ACTIVE 用户和 24 小时访问会话。
        when(userMapper.selectOne(any())).thenReturn(null);
        when(userMapper.insert(any(UserEntity.class))).thenAnswer(invocation -> {
            invocation.<UserEntity>getArgument(0).setId(1L);
            return 1;
        });

        AuthRegisterRequest request = new AuthRegisterRequest();
        request.setAccount(" key.lin ");
        request.setDisplayName("Key Lin");

        assertThat(authService.register(request).getToken()).isNotBlank();

        ArgumentCaptor<UserEntity> userCaptor = ArgumentCaptor.forClass(UserEntity.class);
        ArgumentCaptor<UserSessionEntity> sessionCaptor = ArgumentCaptor.forClass(UserSessionEntity.class);
        verify(userMapper).insert(userCaptor.capture());
        verify(userSessionMapper).insert(sessionCaptor.capture());
        assertThat(userCaptor.getValue().getAccount()).isEqualTo("key.lin");
        assertThat(userCaptor.getValue().getStatus()).isEqualTo(AiDeliveryConstants.STATUS_ACTIVE);
        assertThat(sessionCaptor.getValue().getExpireAt()).isAfter(LocalDateTime.now().plusHours(23));
    }

    @Test
    void registerRejectsDuplicateAccount() {
        // 验证重复账号不会创建第二个用户，提示用户直接登录。
        when(userMapper.selectOne(any())).thenReturn(activeUser());
        AuthRegisterRequest request = new AuthRegisterRequest();
        request.setAccount("key.lin");
        request.setDisplayName("Key Lin");

        assertThatThrownBy(() -> authService.register(request))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.VALIDATION_FAILED);
    }

    @Test
    void loginRejectsDisabledUser() {
        // 验证停用用户不能换取访问 token。
        UserEntity user = activeUser();
        user.setStatus(AiDeliveryConstants.STATUS_DISABLED);
        when(userMapper.selectOne(any())).thenReturn(user);
        AuthLoginRequest request = new AuthLoginRequest();
        request.setAccount("key.lin");

        assertThatThrownBy(() -> authService.login(request))
            .isInstanceOf(BusinessException.class)
            .extracting("errorCode")
            .isEqualTo(AiDeliveryErrorCode.USER_ACCOUNT_UNAVAILABLE);
    }

    @Test
    void authenticateExpiresOldSession() {
        // 验证超过 24 小时的会话会被标记为 EXPIRED，且不再认证通过。
        UserSessionEntity session = new UserSessionEntity();
        session.setUserId(1L);
        session.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        session.setExpireAt(LocalDateTime.now().minusMinutes(1));
        when(userSessionMapper.selectOne(any())).thenReturn(session);

        assertThat(authService.authenticate("token")).isNull();
        assertThat(session.getStatus()).isEqualTo(AiDeliveryConstants.SESSION_EXPIRED);
        verify(userSessionMapper).updateById(session);
    }

    @Test
    void logoutRevokesCurrentSession() {
        // 验证退出登录会将当前 token 对应的会话置为 REVOKED。
        UserSessionEntity session = new UserSessionEntity();
        session.setUserId(1L);
        session.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        session.setExpireAt(LocalDateTime.now().plusHours(1));
        when(userSessionMapper.selectOne(any())).thenReturn(session);

        authService.logout("token");

        assertThat(session.getStatus()).isEqualTo(AiDeliveryConstants.SESSION_REVOKED);
        verify(userSessionMapper).updateById(session);
    }

    private UserEntity activeUser() {
        UserEntity user = new UserEntity();
        user.setId(1L);
        user.setAccount("key.lin");
        user.setDisplayName("Key Lin");
        user.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        return user;
    }
}
