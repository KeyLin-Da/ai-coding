package com.opp.aidelivery.center.config;

import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import java.util.Enumeration;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletRequestWrapper;
import javax.servlet.http.HttpServletResponse;
import com.opp.aidelivery.center.service.AuthService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.util.StringUtils;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, AuthService authService) throws Exception {
        http.cors().and()
            .csrf().disable()
            .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            .and()
            .addFilterBefore(accessSessionAuthenticationFilter(authService), AnonymousAuthenticationFilter.class)
            .authorizeRequests()
            .antMatchers(HttpMethod.GET, "/api/ai-delivery/health").permitAll()
            .antMatchers(HttpMethod.POST, "/api/ai-delivery/auth/register").permitAll()
            .antMatchers(HttpMethod.POST, "/api/ai-delivery/auth/login").permitAll()
            .antMatchers(HttpMethod.POST, "/api/ai-delivery/ws-tickets").permitAll()
            .antMatchers("/api/ai-delivery/ws", "/api/ai-delivery/ws/**").permitAll()
            .antMatchers("/actuator/health").permitAll()
            .anyRequest().authenticated();
        return http.build();
    }

    @Bean
    public OncePerRequestFilter accessSessionAuthenticationFilter(AuthService authService) {
        return new OncePerRequestFilter() {
            @Override
            protected void doFilterInternal(
                HttpServletRequest request,
                HttpServletResponse response,
                FilterChain filterChain
            ) throws ServletException, IOException {
                Long authenticatedUserId = authenticateBearer(request, authService);
                if (authenticatedUserId == null) {
                    authenticatedUserId = authenticateLegacyHeader(request);
                }
                if (authenticatedUserId == null) {
                    filterChain.doFilter(request, response);
                    return;
                }

                UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(
                    authenticatedUserId,
                    null,
                    Collections.singletonList(new SimpleGrantedAuthority("ROLE_USER"))
                );
                SecurityContextHolder.getContext().setAuthentication(authentication);
                filterChain.doFilter(new AuthenticatedRequest(request, String.valueOf(authenticatedUserId)), response);
            }
        };
    }

    private Long authenticateBearer(HttpServletRequest request, AuthService authService) {
        String authorization = request.getHeader("Authorization");
        if (!StringUtils.hasText(authorization) || !authorization.startsWith("Bearer ")) {
            return null;
        }
        return authService.authenticate(authorization.substring("Bearer ".length()).trim());
    }

    private Long authenticateLegacyHeader(HttpServletRequest request) {
        String userId = request.getHeader("X-User-Id");
        if (!StringUtils.hasText(userId)) {
            return null;
        }
        try {
            return Long.valueOf(userId.trim());
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private static class AuthenticatedRequest extends HttpServletRequestWrapper {

        private final String userId;

        AuthenticatedRequest(HttpServletRequest request, String userId) {
            super(request);
            this.userId = userId;
        }

        @Override
        public String getHeader(String name) {
            if ("X-User-Id".equalsIgnoreCase(name)) {
                return userId;
            }
            return super.getHeader(name);
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            if ("X-User-Id".equalsIgnoreCase(name)) {
                return Collections.enumeration(Collections.singletonList(userId));
            }
            return super.getHeaders(name);
        }
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOriginPatterns(Collections.singletonList("*"));
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(Collections.singletonList("*"));
        configuration.setExposedHeaders(Collections.singletonList("*"));
        configuration.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
