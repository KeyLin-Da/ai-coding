# 测试工具类模板

本目录包含后端接口单元测试所需的工具类模板。

## 文件说明

### CompareUtil.java
**用途：** 对象深度对比工具，用于验证接口优化前后数据一致性

**核心功能：**
- `deepCompare(Object oldObj, Object newObj)` - 支持任意嵌套结构的深度对比
- `comparePageResults(PageVO newResults, PageVO oldResults, Class clazz)` - 分页结果对比
- `compareMd5Results(T oldResults, T newResults)` - JSON字符串对比
- 支持 Map、List、数组、普通对象的递归对比
- 自动识别并解析 JSON 字符串进行结构化对比

**使用场景：**
- 性能优化后验证新旧接口返回数据一致
- 重构代码后确保业务逻辑不变
- 接口迁移时验证数据完整性

### HttpClientUtil.java
**用途：** HTTP 客户端工具，用于调用测试环境接口进行对比

**核心功能：**
- `testPostNewAndOlaCompare(...)` - POST 请求新旧接口对比
- `testGetNewAndOlaCompare(...)` - GET 请求新旧接口对比
- `generateToken(String userID)` - 生成测试环境 token
- 自动构建 URL 参数（基于反射）
- 带超时配置的 RestTemplate

**使用场景：**
- 本地优化代码 vs 测试环境原代码对比
- 自动化回归测试
- 性能基准测试

## 使用方法

### 方式一：自动化脚本（强烈推荐）

```bash
cd <skill-directory>
./check-test-utils.sh <module-name>
```

**示例：**
```bash
cd .codex/skills/coding-junit
./check-test-utils.sh opp-material
```

**脚本会自动：**
1. ✓ 检测工程的实际包路径（从 `src/test/java` 目录）
2. ✓ 从模板复制文件到 test 目录的 utils 子目录
3. ✓ 自动替换包路径占位符 `${PACKAGE_PATH}`
4. ✓ 验证编译是否通过

**重要：** 工具类会被创建在 `src/test/java` 目录下，而不是 `src/main/java`！

### 方式二：手动复制（不推荐）

```bash
cd <skill-directory>
cp templates/CompareUtil.java <module-path>/src/test/java/<package-path>/utils/
cp templates/HttpClientUtil.java <module-path>/src/test/java/<package-path>/utils/
```

**示例：**
```bash
cp templates/CompareUtil.java ../opp-material/src/test/java/com/infinitus/opp/material/utils/
cp templates/HttpClientUtil.java ../opp-material/src/test/java/com/infinitus/opp/material/utils/
```

然后修改包声明（**必须**）：

```java
// 将 ${PACKAGE_PATH} 替换为实际的包路径
package com.infinitus.opp.material.utils;  // 示例，根据实际工程调整
```

**注意：** 手动方式需要自己确定正确的包路径，容易出错，建议使用自动化脚本。

### 方式三：跨模块复用

如果其他模块已有这些工具类，可以直接引用：

```java
// 在 opp-learn 模块中引用 opp-material 的工具类
import com.infinitus.opp.material.utils.CompareUtil;
import com.infinitus.opp.material.utils.HttpClientUtil;
```

**注意：** 需要确保模块间有依赖关系。

## 包路径动态检测

**自动化脚本会智能检测：**

1. **优先查找 test 目录下的 utils**：扫描 `src/test/java` 下已有的 utils 目录
2. **分析 Java 文件**：从现有测试 Java 文件中提取 package 声明
3. **智能推断**：移除子包（如 .service, .controller），保留基础包路径

**示例：**

```
工程结构：opp-material/src/test/java/com/infinitus/opp/material/service/TestService.java
检测到 package: com.infinitus.opp.material.service
自动推断基础包: com.infinitus.opp.material
最终生成: com.infinitus.opp.material.utils (在 src/test/java 下)
```

**重要说明：**
- ✅ 工具类放在 `src/test/java` 目录，**不是** `src/main/java`
- ✅ 测试代码才能引用这些工具类
- ✅ 避免将测试依赖污染到业务代码中

## 依赖要求

### CompareUtil 依赖

```xml
<!-- pom.xml -->
<dependencies>
    <!-- Jackson for JSON processing -->
    <dependency>
        <groupId>com.fasterxml.jackson.core</groupId>
        <artifactId>jackson-databind</artifactId>
    </dependency>
    <dependency>
        <groupId>com.fasterxml.jackson.datatype</groupId>
        <artifactId>jackson-datatype-jsr310</artifactId>
    </dependency>
    
    <!-- Spring Boot -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter</artifactId>
    </dependency>
</dependencies>
```

### HttpClientUtil 依赖

```xml
<!-- pom.xml -->
<dependencies>
    <!-- Spring Web -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    
    <!-- Project common result class -->
    <dependency>
        <groupId>com.infinitus.opp</groupId>
        <artifactId>opp-base-common</artifactId>
    </dependency>
</dependencies>
```

## 示例用法

### 性能对比测试

```java
@Test
public void testFindByPageUse2() throws Exception {
    // 准备测试数据
    MatTopicPageQuery request = new MatTopicPageQuery();
    request.setClassId(1509);
    request.setIsMini(1);
    
    // 清除缓存
    RBucket bucket = redissonClient.getBucket(cacheKey);
    bucket.delete();
    
    // 执行新实现
    long startTime = System.currentTimeMillis();
    PageVO<MatTopicInfoDTO> result = service.findByPageUse2(request);
    long endTime = System.currentTimeMillis();
    
    System.out.println("优化后执行时间: " + (endTime - startTime) + "ms");
    
    // 与测试环境旧实现对比
    Boolean isSame = testPostNewAndOlaCompare(
        "https://opp-api-test.infinitus.com.cn/news/v3/topic/findByPageUse2",
        request,
        result,
        new ParameterizedTypeReference<Result<PageVO<MatTopicInfoDTO>>>() {}
    );
    
    System.out.println("对比结果: " + (isSame ? "✓ 一致" : "✗ 不一致"));
    assertTrue("新旧接口返回数据应一致", isSame);
}
```

### 直接对象对比

```java
@Test
public void testCompareObjects() {
    Object oldResult = getOldImplementation();
    Object newResult = getNewImplementation();
    
    Boolean isSame = CompareUtil.deepCompare(oldResult, newResult);
    
    if (!isSame) {
        System.out.println("发现差异，请查看上方输出的详细信息");
    }
    
    assertTrue("新旧实现应返回相同结果", isSame);
}
```

## 注意事项

1. **首次使用前必须检查工具类是否存在**
2. **确保包路径正确**（自动化脚本会处理）
3. **测试环境地址配置**：修改为实际的测试环境 URL
4. **Token 生成**：仅用于本地测试，生产环境请使用真实认证
5. **超时配置**：默认连接超时 30s，读取超时 60s，可根据需要调整

## 常见问题

### Q: 为什么需要这两个工具类？

A: 
- **CompareUtil**：提供强大的对象对比能力，能深入嵌套结构找出差异
- **HttpClientUtil**：简化测试环境接口调用，自动化新旧对比流程

### Q: 可以在多个模块共享吗？

A: 可以。建议放在公共模块（如 `opp-common`），或者在每个需要的模块中各放一份。

### Q: 如何自定义对比规则？

A: 可以扩展 `CompareUtil`，添加特定的字段忽略逻辑或自定义对比策略。

### Q: 对比结果为 false 但看起来一样？

A: 检查 `CompareUtil.deepCompare` 的详细输出，可能是：
- 字段顺序不同
- null vs 空字符串
- 日期格式差异
- 浮点数精度问题

## 维护者

- Author: key.lin
- Created: 2026-01-22
- Last Updated: 2026-05-19

## 更新日志

- 2026-05-19: 创建模板文件和自动化脚本
- 2026-01-22: 初始版本（CompareUtil、HttpClientUtil）
