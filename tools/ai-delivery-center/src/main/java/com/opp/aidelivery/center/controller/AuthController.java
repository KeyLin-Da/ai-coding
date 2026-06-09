package com.opp.aidelivery.center.controller;

import com.opp.aidelivery.center.common.api.ApiResponse;
import com.opp.aidelivery.center.model.dto.AuthLoginRequest;
import com.opp.aidelivery.center.model.dto.AuthProfileUpdateRequest;
import com.opp.aidelivery.center.model.dto.AuthRegisterRequest;
import com.opp.aidelivery.center.model.vo.AuthSessionVO;
import com.opp.aidelivery.center.model.vo.UserProfileVO;
import com.opp.aidelivery.center.security.CurrentUser;
import com.opp.aidelivery.center.service.AuthService;
import javax.servlet.http.HttpServletRequest;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/ai-delivery/auth")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ApiResponse<AuthSessionVO> register(@Valid @RequestBody AuthRegisterRequest request) {
        return ApiResponse.ok(authService.register(request));
    }

    @PostMapping("/login")
    public ApiResponse<AuthSessionVO> login(@Valid @RequestBody AuthLoginRequest request) {
        return ApiResponse.ok(authService.login(request));
    }

    @GetMapping("/me")
    public ApiResponse<UserProfileVO> me() {
        return ApiResponse.ok(authService.me(CurrentUser.id()));
    }

    @PostMapping("/profile")
    public ApiResponse<UserProfileVO> updateProfile(@Valid @RequestBody AuthProfileUpdateRequest request) {
        return ApiResponse.ok(authService.updateProfile(CurrentUser.id(), request));
    }

    @PostMapping("/logout")
    public ApiResponse<Void> logout(HttpServletRequest request) {
        authService.logout(extractBearerToken(request));
        return ApiResponse.ok(null);
    }

    private String extractBearerToken(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        if (authorization != null && authorization.startsWith("Bearer ")) {
            return authorization.substring("Bearer ".length()).trim();
        }
        return "";
    }
}
