package ${PACKAGE_PATH}.utils;

import com.fasterxml.jackson.core.type.TypeReference;
import dev.macula.boot.result.Result;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

/**
 * HTTP客户端工具类 - 用于接口测试和对比
 * 
 * @author key.lin
 * @create 2026/1/22
 */
public class HttpClientUtil {

    private static final RestTemplate restTemplate = createRestTemplate();

    /**
     * 创建带超时配置的RestTemplate
     */
    private static RestTemplate createRestTemplate() {
        ClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory() {
            @Override
            protected void prepareConnection(java.net.HttpURLConnection connection, String httpMethod) throws java.io.IOException {
                super.prepareConnection(connection, httpMethod);
                connection.setConnectTimeout(30000); // 连接超时30秒
                connection.setReadTimeout(60000);    // 读取超时60秒
            }
        };
        return new RestTemplate(factory);
    }

    /**
     * POST请求 - 测试环境
     */
    public static <T> Result<T> testRestTemplatePost(String url, Object request, ParameterizedTypeReference<Result<T>> responseType) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        // 添加测试环境token
        String token = generateToken("0012900");
        headers.set("Authorization", "Bearer " + token);
        
        HttpEntity<Object> entity = new HttpEntity<>(request, headers);
        
        try {
            ResponseEntity<Result<T>> response = restTemplate.exchange(
                url, 
                HttpMethod.POST, 
                entity, 
                responseType
            );
            return response.getBody();
        } catch (Exception e) {
            System.err.println("HTTP POST请求失败: " + e.getMessage());
            throw new RuntimeException("调用测试环境接口失败", e);
        }
    }

    /**
     * GET请求 - 测试环境
     */
    public static <T> Result<T> testRestTemplateGet(String url, Object request, ParameterizedTypeReference<Result<T>> responseType) {
        // 构建带参数的URL
        String fullUrl = buildUrlWithParams(url, request);
        
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        // 添加测试环境token
        String token = generateToken("test_user_001");
        headers.set("Authorization", "Bearer " + token);
        
        HttpEntity<?> entity = new HttpEntity<>(headers);
        
        try {
            ResponseEntity<Result<T>> response = restTemplate.exchange(
                fullUrl, 
                HttpMethod.GET, 
                entity, 
                responseType
            );
            return response.getBody();
        } catch (Exception e) {
            System.err.println("HTTP GET请求失败: " + e.getMessage());
            throw new RuntimeException("调用测试环境接口失败", e);
        }
    }

    /**
     * 生成测试环境token（仅用于本地测试）
     *
     * @param userID 用户ID
     * @return token字符串
     */
    public static String generateToken(String userID) {
        String s = "token##" + userID + "##" + "oL4Pyv8GSjewJGjCmCZ" + userID + "##o57RJ5ENydHeZnHoBWnh_xrt4I7w##ecp##mock";
        try {
            byte[] encodedBytes = Base64.encodeBase64(s.getBytes(StandardCharsets.UTF_8));
            return new String(encodedBytes);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * POST请求新旧接口对比
     * 
     * @param testUrl 测试环境接口地址
     * @param request 请求参数
     * @param optimizedData 优化后的数据（新实现）
     * @param responseType 响应类型
     * @return 对比结果，true表示一致
     */
    public static <T> Boolean testPostNewAndOlaCompare(String testUrl, Object request, T optimizedData, ParameterizedTypeReference<Result<T>> responseType) throws Exception {
        long startTimeOld = System.currentTimeMillis();
        Result<T> result = HttpClientUtil.testRestTemplatePost(testUrl, request, responseType);
        long endTimeOld = System.currentTimeMillis();
        System.out.println("优化前 执行时间: " + (endTimeOld - startTimeOld) + "ms");
        
        T originalData = result.getData();
        return CompareUtil.compareMd5Results(originalData, optimizedData);
    }

    /**
     * GET请求新旧接口对比
     * 
     * @param testUrl 测试环境接口地址
     * @param request 请求参数
     * @param optimizedData 优化后的数据（新实现）
     * @param responseType 响应类型
     * @return 对比结果，true表示一致
     */
    public static <T> Boolean testGetNewAndOlaCompare(String testUrl, Object request, T optimizedData, ParameterizedTypeReference<Result<T>> responseType) throws Exception {
        long startTimeOld = System.currentTimeMillis();
        Result<T> result = HttpClientUtil.testRestTemplateGet(testUrl, request, responseType);
        long endTimeOld = System.currentTimeMillis();
        System.out.println("优化前 执行时间: " + (endTimeOld - startTimeOld) + "ms");
        
        T originalData = result.getData();
        return CompareUtil.compareMd5Results(originalData, optimizedData);
    }

    /**
     * 使用反射根据base URL和request对象构建完整的URL
     * 
     * @param baseUrl 基础URL
     * @param request 包含查询参数的对象
     * @return 完整的URL字符串
     */
    private static String buildUrlWithParams(String baseUrl, Object request) {
        if (request == null) {
            return baseUrl;
        }

        StringBuilder urlBuilder = new StringBuilder(baseUrl);
        boolean hasParams = baseUrl.contains("?");

        // 获取request对象的所有字段
        java.lang.reflect.Field[] fields = getAllFields(request.getClass());

        for (java.lang.reflect.Field field : fields) {
            try {
                field.setAccessible(true); // 允许访问私有字段
                Object value = field.get(request);

                if (value != null) {
                    String fieldName = field.getName();
                    String encodedValue = java.net.URLEncoder.encode(value.toString(), StandardCharsets.UTF_8.name());

                    if (!hasParams) {
                        urlBuilder.append("?");
                        hasParams = true;
                    } else {
                        urlBuilder.append("&");
                    }
                    urlBuilder.append(fieldName).append("=").append(encodedValue);
                }
            } catch (IllegalAccessException e) {
                // 忽略无法访问的字段
                System.err.println("无法访问字段: " + field.getName() + ", 错误: " + e.getMessage());
            } catch (Exception e) {
                // 处理其他异常
                System.err.println("处理字段时出错: " + field.getName() + ", 错误: " + e.getMessage());
            }
        }

        return urlBuilder.toString();
    }

    /**
     * 获取类及其父类的所有字段
     * 
     * @param clazz 要检查的类
     * @return 字段数组
     */
    private static java.lang.reflect.Field[] getAllFields(Class<?> clazz) {
        java.lang.reflect.Field[] fields = new java.lang.reflect.Field[0];

        while (clazz != null && !clazz.equals(Object.class)) {
            java.lang.reflect.Field[] declaredFields = clazz.getDeclaredFields();
            java.lang.reflect.Field[] tempFields = new java.lang.reflect.Field[fields.length + declaredFields.length];

            System.arraycopy(fields, 0, tempFields, 0, fields.length);
            System.arraycopy(declaredFields, 0, tempFields, fields.length, declaredFields.length);

            fields = tempFields;
            clazz = clazz.getSuperclass();
        }

        return fields;
    }
}
