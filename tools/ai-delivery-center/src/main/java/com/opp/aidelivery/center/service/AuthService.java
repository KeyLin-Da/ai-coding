package com.opp.aidelivery.center.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.opp.aidelivery.center.common.error.AiDeliveryErrorCode;
import com.opp.aidelivery.center.common.error.BusinessException;
import com.opp.aidelivery.center.mapper.UserMapper;
import com.opp.aidelivery.center.mapper.UserSessionMapper;
import com.opp.aidelivery.center.model.AiDeliveryConstants;
import com.opp.aidelivery.center.model.dto.AuthLoginRequest;
import com.opp.aidelivery.center.model.dto.AuthProfileUpdateRequest;
import com.opp.aidelivery.center.model.dto.AuthRegisterRequest;
import com.opp.aidelivery.center.model.entity.UserEntity;
import com.opp.aidelivery.center.model.entity.UserSessionEntity;
import com.opp.aidelivery.center.model.vo.AuthSessionVO;
import com.opp.aidelivery.center.model.vo.UserProfileVO;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private static final int SESSION_HOURS = 24;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final UserMapper userMapper;
    private final UserSessionMapper userSessionMapper;

    @Transactional(rollbackFor = Exception.class)
    public AuthSessionVO register(AuthRegisterRequest request) {
        String account = normalizeAccount(request.getAccount());
        UserEntity existing = findByAccount(account);
        if (existing != null) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "账号已存在，请直接登录");
        }
        UserEntity user = new UserEntity();
        user.setAccount(account);
        user.setDisplayName(request.getDisplayName().trim());
        user.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        userMapper.insert(user);
        return createSession(user);
    }

    @Transactional(rollbackFor = Exception.class)
    public AuthSessionVO login(AuthLoginRequest request) {
        UserEntity user = findByAccount(normalizeAccount(request.getAccount()));
        if (user == null || !AiDeliveryConstants.STATUS_ACTIVE.equals(user.getStatus())) {
            throw new BusinessException(AiDeliveryErrorCode.USER_ACCOUNT_UNAVAILABLE, "用户账号不存在或已停用");
        }
        return createSession(user);
    }

    @Transactional(rollbackFor = Exception.class)
    public UserProfileVO me(Long userId) {
        return toUserProfile(loadActiveUser(userId));
    }

    @Transactional(rollbackFor = Exception.class)
    public UserProfileVO updateProfile(Long userId, AuthProfileUpdateRequest request) {
        UserEntity user = loadActiveUser(userId);
        user.setDisplayName(request.getDisplayName().trim());
        user.setAvatarUrl(request.getAvatarUrl() == null ? null : request.getAvatarUrl().trim());
        userMapper.updateById(user);
        return toUserProfile(user);
    }

    @Transactional(rollbackFor = Exception.class)
    public void logout(String rawToken) {
        if (rawToken == null || rawToken.trim().isEmpty()) {
            return;
        }
        UserSessionEntity session = loadSessionByToken(rawToken);
        if (session != null) {
            session.setStatus(AiDeliveryConstants.SESSION_REVOKED);
            userSessionMapper.updateById(session);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public Long authenticate(String rawToken) {
        UserSessionEntity session = loadSessionByToken(rawToken);
        if (session == null) {
            return null;
        }
        LocalDateTime now = LocalDateTime.now();
        if (!AiDeliveryConstants.STATUS_ACTIVE.equals(session.getStatus()) || session.getExpireAt().isBefore(now)) {
            if (AiDeliveryConstants.STATUS_ACTIVE.equals(session.getStatus())) {
                session.setStatus(AiDeliveryConstants.SESSION_EXPIRED);
                userSessionMapper.updateById(session);
            }
            return null;
        }
        UserEntity user = userMapper.selectById(session.getUserId());
        if (user == null || !AiDeliveryConstants.STATUS_ACTIVE.equals(user.getStatus())) {
            return null;
        }
        session.setLastAccessAt(now);
        userSessionMapper.updateById(session);
        return session.getUserId();
    }

    public String tokenHash(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                builder.append(String.format("%02x", b));
            }
            return builder.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    private AuthSessionVO createSession(UserEntity user) {
        String rawToken = nextToken();
        LocalDateTime now = LocalDateTime.now();
        UserSessionEntity session = new UserSessionEntity();
        session.setUserId(user.getId());
        session.setTokenHash(tokenHash(rawToken));
        session.setStatus(AiDeliveryConstants.STATUS_ACTIVE);
        session.setExpireAt(now.plusHours(SESSION_HOURS));
        session.setLastAccessAt(now);
        userSessionMapper.insert(session);

        AuthSessionVO vo = new AuthSessionVO();
        vo.setToken(rawToken);
        vo.setExpireAt(session.getExpireAt());
        vo.setUser(toUserProfile(user));
        return vo;
    }

    private UserSessionEntity loadSessionByToken(String rawToken) {
        if (rawToken == null || rawToken.trim().isEmpty()) {
            return null;
        }
        return userSessionMapper.selectOne(new LambdaQueryWrapper<UserSessionEntity>()
            .eq(UserSessionEntity::getTokenHash, tokenHash(rawToken.trim()))
            .last("LIMIT 1"));
    }

    private UserEntity loadActiveUser(Long userId) {
        UserEntity user = userMapper.selectById(userId);
        if (user == null || !AiDeliveryConstants.STATUS_ACTIVE.equals(user.getStatus())) {
            throw new BusinessException(AiDeliveryErrorCode.USER_ACCOUNT_UNAVAILABLE, "用户账号不存在或已停用");
        }
        return user;
    }

    private UserEntity findByAccount(String account) {
        return userMapper.selectOne(new LambdaQueryWrapper<UserEntity>()
            .eq(UserEntity::getAccount, account)
            .last("LIMIT 1"));
    }

    private String normalizeAccount(String account) {
        String value = account == null ? "" : account.trim();
        if (value.isEmpty()) {
            throw new BusinessException(AiDeliveryErrorCode.VALIDATION_FAILED, "账号不能为空");
        }
        return value;
    }

    private String nextToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private UserProfileVO toUserProfile(UserEntity user) {
        UserProfileVO vo = new UserProfileVO();
        vo.setId(user.getId());
        vo.setAccount(user.getAccount());
        vo.setDisplayName(user.getDisplayName());
        vo.setAvatarUrl(user.getAvatarUrl());
        vo.setStatus(user.getStatus());
        return vo;
    }
}
