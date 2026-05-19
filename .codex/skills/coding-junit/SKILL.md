---
name: coding-junit
description: 后端接口单元测试生成专家，根据 Git commit 变更自动生成 Java 单元测试代码，支持性能对比、修改验证和新增接口测试
license: MIT
compatibility: Requires Maven, JUnit, Spring Boot Test. Works with CodeBuddy Code.
metadata:
   author: key.lin
   version: "1.0"
---

# 后端接口单元测试生成 Skill

## 核心功能

根据 Git commit 变更，自动生成后端 Java 接口的单元测试代码。

**用户只需提供模块名，Skill 自动完成：**
1. ✅ 检查并创建测试工具类（CompareUtil、HttpClientUtil）
2. ✅ 分析 Git 变更，识别接口类型（新增/修改/性能优化）
3. ✅ **智能判断测试策略**：
   - 新增接口：自动生成基础测试 + 边界测试 + 组合条件测试
   - 修改接口：针对改动点生成专项测试，并询问是否需要新旧对比测试
   - 性能优化：视为修改旧接口；用户明确需要对比时才生成新旧返参对比测试
4. ✅ 生成对应的测试代码
5. ✅ **执行单元测试并生成报告**：运行测试；如有失败，定位失败类/方法并写入异常测试清单，等待用户后续重新执行 Skill 触发重跑；最终将结果输出到 `docs/junit/{需求号}/`

**可选：提供描述说明以澄清测试意图**
- 明确测试重点和边界场景
- 说明改动背景和业务逻辑
- 指定特定的测试策略

## 使用方式

```bash
# 基础用法：仅指定模块名（自动分析 Git 变更）
generate-unit-test opp-material

# 高级用法：指定模块名 + 描述说明
generate-unit-test opp-material "优化了素材列表查询性能，使用缓存减少数据库访问"

# 重跑模式：用户重新执行 Skill 并明确要求重跑异常单元测试
generate-unit-test opp-material "重跑异常单元测试"
```

### 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| 模块名 | ✅ | Java 模块名称，如 `opp-material`、`opp-learn` |
| 描述说明 | ❌ | 可选，用于澄清测试意图或补充上下文信息 |

### 交互流程

当用户提供模块名后，Skill 会执行以下步骤：

1. **分析 Git 变更**：自动识别当前模块的代码变更
2. **智能判断测试策略**：新增接口直接生成完整覆盖测试；修改旧接口先确认是否追加新旧返参对比测试
3. **生成测试代码**：根据接口变更类型和确认结果生成对应的单元测试
4. **重跑模式**：如果用户明确要求"重跑异常单元测试"，不要重新走生成流程；优先读取上次报告或 `target/surefire-reports` 中的失败清单，只重跑异常测试

### 强制流程门禁

1. **未完成必要确认前，禁止创建或修改测试文件**。
2. 不再要求用户选择三种场景；Skill 必须自动判断新增接口、修改接口、性能优化等类型。
3. 如果检测到旧接口被修改，必须只询问用户是否需要新增新旧接口返参对比测试；除非用户已经明确写明"需要对比"、"不需要对比"或"自动判断并直接生成"。
4. 如果任一接口需要新旧对比测试，必须满足：
   - **本地新实现通过 `@Autowired` 注入的 Service 直接调用（不要注入 Controller）**
   - **禁止把新实现的业务逻辑搬到测试类里重写**；测试类只能准备参数、调用新 Service 方法、调用旧 HTTP 接口、比较返回结果
   - 如果变更入口是 Controller，必须找到其背后的 Service/实现类方法作为新实现调用点；如果没有可调用的 Service 方法，先提示用户确认可调用方法或是否需要把业务逻辑下沉到 Service，不能在测试类中复制 Controller 逻辑
   - 旧实现只能通过测试环境 HTTP 调用
   - 必须使用 `testGetNewAndOlaCompare` 或 `testPostNewAndOlaCompare`
   - 至少准备 3 组测试参数
5. **禁止在生成的单元测试中使用 `@Ignore`、`@Disabled` 或其他默认跳过机制**。如果测试依赖真实数据、测试环境地址、登录态、token、用户编号、活动 ID 等上下文，必须先提示用户补充这些数据，再继续生成并执行测试。
6. **尽量保证所有生成的单元测试都实际跑完**。只有遇到环境、依赖、网络、权限等客观阻塞时，才允许记录未执行项，并必须在最终回复和报告中说明阻塞原因、已执行命令、已通过/失败数量。
7. **支持异常单元测试重跑，但不自动重跑**：首次测试失败后，必须解析 Maven/Surefire/JUnit 输出或 `target/surefire-reports`，定位失败的测试类和测试方法，写入报告中的异常测试清单；只有当用户后续重新执行 Skill 并明确要求"重跑异常单元测试"时，才使用 `-Dtest=ClassName#methodName` 或 `-Dtest=ClassName` 重跑失败项。
8. **测试完成后必须生成报告到 `docs/junit/{需求号}/` 目录**。
9. **最终回复验收**：必须列出检测到的接口类型、生成的测试类、是否包含新旧对比测试、测试结果、异常测试清单或重跑结果、验证命令、报告路径。

### 智能判断与确认流程

Skill 会自动分析 Git 变更，并根据接口类型采取不同策略。不要弹出三种场景选择。

#### 1. 新增接口
**自动处理**：直接生成完整测试用例
- 基础测试：验证基本功能
- 边界测试：验证边界条件
- 组合条件测试：验证复杂业务规则

#### 2. 修改旧接口
**只确认一件事**：是否需要新增新旧接口返参对比测试

```
检测到以下修改接口：

1. MatTopicService.findByPageUse2()
   - 改动点：优化了 SQL 查询逻辑
   
是否需要为该接口添加新旧对比测试？（Y/N）
- Y: 生成针对改动点的专项测试 + 新旧返参对比测试
- N: 仅生成针对改动点的专项测试
```

如果用户选择 Y，但对比测试缺少真实请求参数或测试环境信息，继续向用户收集最小必要数据，例如：

```
需要补充以下真实测试数据后才能生成并执行新旧返参对比测试：
1. 测试环境旧接口地址
2. 至少 3 组可用请求参数
3. 如接口需要登录态，请提供测试用户编号或 token 生成规则
```

**选择说明：**
- **选择 Y**：生成两种测试
  - 专项测试：验证改动点的逻辑正确性
  - 新旧返参对比：通过 HTTP 调用测试环境旧实现，验证返回数据一致性
- **选择 N**：仅生成专项测试，验证改动点是否符合预期

#### 3. 性能优化接口
**视为修改旧接口处理**：默认先询问是否需要新旧返参对比测试；如果用户描述已明确要求性能/返参对比，可直接生成
- 特征：方法签名未变，仅内部实现优化
- 策略：专项测试验证优化逻辑；如用户确认需要对比，再本地调用新实现 + HTTP 调用旧实现进行返参对比

### 异常单元测试重跑流程

异常测试重跑必须由用户重新执行 Skill 或明确提出"重跑异常单元测试"来触发，不能在首次失败后自动重跑。

#### 首次执行测试失败时

1. **定位失败项**：读取 Maven/Surefire/JUnit 控制台输出和 `target/surefire-reports`，提取失败的测试类、测试方法、异常栈和断言信息。
2. **判断失败类型**：
   - 测试代码问题、Mock 数据缺失、断言不合理、入参构造错误：记录建议修复点，必要时修复测试代码，但不要自动进入失败重跑流程。
   - 被测代码真实缺陷：不要为了通过测试改弱断言；记录缺陷并向用户说明。
   - 环境/依赖/网络/权限/真实数据缺失：记录阻塞原因；需要用户补充时列出最小必要数据。
3. **写入异常测试清单**：报告必须记录失败类、失败方法、失败命令、失败原因摘要、建议重跑命令。
4. **提示用户下一步**：最终回复说明如需重跑，请重新执行 Skill 并说明"重跑异常单元测试"。

#### 用户触发重跑模式时

1. **读取失败记录**：优先读取 `docs/junit/{需求号}/` 下的报告；如果报告不存在，再读取 `target/surefire-reports`。
2. **只重跑异常测试**：使用 `mvn test -Dtest=ClassName#methodName` 或 `mvn test -Dtest=ClassName` 重跑失败项，不重新生成测试代码，除非失败原因明确需要修复测试。
3. **必要时收集数据**：如果失败原因是真实数据缺失，先提示用户补充数据，不要生成 `@Ignore` 或静默跳过。
4. **更新报告**：追加重跑记录，包括触发时间、重跑命令、通过/失败结果、仍失败的原因。
5. **相关集合复核**：异常测试通过后，可询问用户是否需要继续重跑本次相关测试集合；不要默认自动扩大重跑范围。

### 描述说明的使用场景

1. **明确测试重点**："重点测试分页查询的边界条件，特别是空数据和大数据量场景"
2. **说明改动背景**："修复了并发场景下的数据不一致问题，需要验证线程安全性"
3. **指定测试策略**："这是性能优化，需要使用新旧对比测试验证结果一致性"
4. **补充业务逻辑**："新增了会员等级过滤逻辑，需要测试不同等级的数据隔离"

## 测试策略类型

### 修改已有接口 - 专项测试
- **特征**：Service 方法签名未变，内部逻辑调整
- **策略**：针对改动点补充专项测试用例
- **示例**：修复了某个字段的计算逻辑、增加了新的过滤条件

### 修改已有接口 - 新旧返参对比测试
- **特征**：功能不变，仅优化实现方式
- **策略**：用户确认需要后，使用 `testGetNewAndOlaCompare` 或 `testPostNewAndOlaCompare` 进行新旧返参对比
- **示例**：引入缓存、优化 SQL 查询、减少循环次数
- **调用方式说明**：
  - **本地：通过 `@Autowired` 注入的 Service 直接调用（不要注入 Controller）**
  - **禁止：在测试类里复制新实现的分页、统计、聚合、过滤、组装 VO 等业务逻辑**
  - 测试环境：通过 HTTP 请求调用旧实现进行结果对比
- **执行要求**：不得用 `@Ignore` 或 `@Disabled` 跳过；缺真实数据时先向用户收集，再执行测试

### 新增接口 - 完整覆盖测试
- **特征**：全新的 Service/Controller 方法
- **策略**：生成基础测试 + 边界测试 + 组合条件测试
- **示例**：新增加载详情接口、批量操作接口、统计接口

## 测试代码模板

### 模板 1：性能优化对比测试

```java
/**
 * 性能优化对比测试 - findByPageUse2
 * 
 * 测试目的：验证优化后的实现与旧实现在功能上保持一致，同时记录性能提升情况
 * 测试策略：本地直接调用新 Service 实现方法 + HTTP 调用测试环境旧实现进行结果对比
 * 注意：不要在测试类中复制新实现的业务逻辑，测试类只负责调用 Service 并比较返回值
 * 测试数据：准备 3 组不同的查询参数，覆盖常见业务场景
 */
@Test
public void testFindByPageUse2() throws Exception {
    // 1. 准备测试用例数据 - 至少 3 组不同参数组合
    List<MatTopicPageQuery> testCases = Arrays.asList(
            createTestCase(1509, 1),  // 正常分页查询
            createTestCase(1510, 1),  // 不同分类 ID
            createTestCase(1511, 1)   // 边界值测试
    );

    int successCount = 0;  // 成功计数
    int errorCount = 0;    // 失败计数

    // 2. 遍历执行每个测试用例
    for (int i = 0; i < testCases.size(); i++) {
        MatTopicPageQuery request = testCases.get(i);
        try {
            // 2.1 清除 Redis 缓存，确保每次测试都是真实执行
            RBucket bucket = redissonClient.getBucket(cacheKey);
            bucket.delete();
            
            // 2.2 【本地调用】直接通过 Spring 注入的 Service 调用新实现
            // 注意：这里不是 HTTP 请求，是直接调用 Java 方法
            // 重要：注入的是 Service，不是 Controller
            // 禁止：不要在测试类中重写 findByPageUse2 的分页、查询、过滤、聚合、VO 组装逻辑
            long startTime = System.currentTimeMillis();
            PageVO<MatTopicInfoDTO> result = matTopicService.findByPageUse2(request);
            long endTime = System.currentTimeMillis();

            System.out.println("优化后执行时间: " + (endTime - startTime) + "ms");
            
            // 2.3 【测试环境对比】通过 HTTP 请求调用测试环境的旧实现
            // 将本地新实现的返回结果与测试环境旧实现的结果进行深度对比
            Boolean same = testPostNewAndOlaCompare(
                    "https://opp-api-test.infinitus.com.cn/news/v3/topic/findByPageUse2",
                    request,
                    result,
                    new ParameterizedTypeReference<Result<PageVO<MatTopicInfoDTO>>>() {}
            );

            System.out.println("对比结果: " + same);
            successCount++;

        } catch (Exception e) {
            // 2.4 异常处理 - 单个用例失败不影响其他用例执行
            System.err.println("测试用例执行出错: " + e.getMessage());
            errorCount++;
        }
    }

    // 3. 输出测试总结
    System.out.println("测试完成，成功: " + successCount + "，失败: " + errorCount);
}

/**
 * 创建测试用例 - 构造查询请求参数
 * 
 * @param classId 分类 ID
 * @param isMini 是否小程序端（1-是，0-否）
 * @return 构造好的查询请求对象
 */
private MatTopicPageQuery createTestCase(Integer classId, Integer isMini) {
    MatTopicPageQuery request = new MatTopicPageQuery();
    request.setIsMini(isMini);
    request.setClassId(classId);
    return request;
}
```

**关键说明：**
- **本地调用**：`matTopicService.findByPageUse2(request)` - 直接通过 Spring 注入的 **Service** 实现类调用，获取返回结果
- **测试环境对比**：`testPostNewAndOlaCompare(url, ...)` - 通过 HTTP 请求调用测试环境的旧实现，与本地新实现的结果进行对比
- **不要混淆**：本地不使用 HTTP 请求调用自己的服务，只有对比测试环境时才用 HTTP
- **不要复刻逻辑**：不要在测试类里写 `buildOptimizedResult`、手写 SQL 聚合、复制 Controller 分支或复制 Service 内部实现；这些都会让测试变成验证拷贝代码
- **重要原则**：单元测试应该测试 Service 层，而不是 Controller 层

### 模板 2：修改接口 - 补充用例

```java
/**
 * 修改接口测试 - 针对特定业务场景的专项验证
 * 
 * 测试目的：验证改动后的逻辑在特定场景下是否正确
 * 测试重点：关注代码变更点，确保修改没有引入新的问题
 */
@Test
public void testMethodWithScenario() {
    // 1. 准备测试数据 - 根据改动点构造特定的测试场景
    RequestDTO request = new RequestDTO();
    request.setField1(value1);  // 设置关键字段 1
    request.setField2(value2);  // 设置关键字段 2

    // 2. 执行测试 - 调用被测试的 Service 方法（不是 Controller）
    ResponseVO result = xxxService.methodName(request);

    // 3. 验证结果 - 断言返回结果符合预期
    assertNotNull("返回结果不应为null", result);
    assertEquals("验证改动点", expectedValue, result.getField());
    
    // 4. 验证列表数据 - 如果有返回列表，需要遍历验证每个元素
    if (result.getRecords() != null && !result.getRecords().isEmpty()) {
        for (RecordVO record : result.getRecords()) {
            assertTrue("验证条件", condition);  // 验证每条记录满足业务规则
        }
    }
}
```

### 模板 3：新增接口 - 完整覆盖

```java
/**
 * 基础测试：基本功能验证
 * 
 * 测试目的：验证新接口的基本功能是否正常工作
 * 测试场景：使用正常的输入参数，验证接口能否正确返回结果
 */
@Test
public void testMethodBasic() {
    // 1. 准备测试数据 - 使用默认的正常值
    RequestDTO request = new RequestDTO();
    request.setField1(defaultValue1);  // 设置默认值
    
    // 2. 执行测试 - 调用 Service 方法（不是 Controller）
    ResponseVO result = xxxService.methodName(request);
    
    // 3. 验证结果 - 确保返回不为空
    assertNotNull("返回结果不应为null", result);
}

/**
 * 边界测试：边界场景
 * 
 * 测试目的：验证接口在边界条件下的行为
 * 测试场景：空值、最大值、最小值、空列表等边界情况
 */
@Test
public void testMethodWithBoundary() {
    // 1. 准备边界测试数据
    RequestDTO request = new RequestDTO();
    request.setField(boundaryValue);  // 设置边界值（如 null、0、最大值等）
    
    // 2. 执行测试 - 调用 Service 方法
    ResponseVO result = xxxService.methodName(request);
    
    // 3. 验证结果 - 边界情况下应该有合理的处理
    assertNotNull("返回结果不应为null", result);
}

/**
 * 组合条件测试
 * 
 * 测试目的：验证多个条件组合时的业务逻辑是否正确
 * 测试场景：同时设置多个字段，验证复杂的业务规则
 */
@Test
public void testMethodWithCombinedConditions() {
    // 1. 准备组合条件的测试数据
    RequestDTO request = new RequestDTO();
    request.setField1(value1);  // 设置条件 1
    request.setField2(value2);  // 设置条件 2
    request.setField3(value3);  // 设置条件 3
    
    // 2. 执行测试 - 调用 Service 方法
    ResponseVO result = xxxService.methodName(request);
    
    // 3. 验证结果
    assertNotNull("返回结果不应为null", result);
    
    // 4. 验证返回的数据满足所有条件
    if (result.getRecords() != null) {
        for (RecordVO vo : result.getRecords()) {
            assertTrue("验证条件1", condition1);  // 验证条件 1 成立
            assertTrue("验证条件2", condition2);  // 验证条件 2 成立
        }
    }
}
```

## 关键依赖导入

```java
import com.infinitus.opp.material.utils.CompareUtil;
import com.infinitus.opp.material.utils.HttpClientUtil;
import dev.macula.boot.result.PageVO;
import dev.macula.boot.result.Result;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.redisson.api.RBucket;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.test.context.junit4.SpringRunner;

import java.util.Arrays;
import java.util.List;

import static com.infinitus.opp.material.utils.HttpClientUtil.testPostNewAndOlaCompare;
import static com.infinitus.opp.material.utils.HttpClientUtil.testGetNewAndOlaCompare;
```

## 测试类结构

```java
/**
 * Service 单元测试类
 * 
 * 测试目标：验证 Service 层方法的正确性
 * 测试范围：包括正常场景、边界场景、异常场景的覆盖
 * 重要原则：单元测试应该测试 Service 层，而不是 Controller 层
 */
@RunWith(SpringRunner.class)
@SpringBootTest(classes = ApplicationClass.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class ServiceNameTest {

    /**
     * 注入被测试的 Service 实例（不要注入 Controller）
     */
    @Autowired
    private XxxService xxxService;
    
    /**
     * 注入 Redisson 客户端，用于缓存操作
     */
    @Autowired
    private RedissonClient redissonClient;
    
    // 测试方法...
}
```

**重要说明：**
- ✅ **推荐做法**：注入 Service 进行单元测试，直接测试业务逻辑
- ❌ **不推荐**：注入 Controller 进行测试，这样会引入不必要的 Web 层依赖
- **原因**：Service 层是业务逻辑的核心，单元测试应该聚焦于业务逻辑的正确性

## 注意事项

1. **缓存处理**：测试前必须清除 Redis 缓存
2. **多测试用例**：至少准备 3-5 个不同的测试参数组合
3. **异常处理**：每个测试用例用 try-catch 包裹
4. **日志输出**：打印执行时间和对比结果
5. **描述说明**：当提供描述说明时，优先根据描述调整测试策略和用例设计
6. **调用方式区分**（重要）：
   - **本地测试**：通过 `@Autowired` 注入的 **Service** 直接调用实现类方法获取返回结果（不要注入 Controller）
   - **测试环境对比**：仅在使用 `testGetNewAndOlaCompare` 或 `testPostNewAndOlaCompare` 时才通过 HTTP 请求调用测试环境的旧实现
   - **不要混淆**：本地不使用 HTTP 请求调用自己的服务，只有与测试环境对比时才用 HTTP
   - **不要复制实现**：新旧对比测试中，新实现结果必须来自真实 Service 方法返回值，禁止把新实现逻辑、Controller 分支、SQL 聚合或 VO 组装逻辑搬到测试类
7. **单元测试报告**：
   - 测试完成后必须生成报告到 `docs/junit/{需求号}/`
   - 报告需要包含测试摘要、覆盖率、性能数据等关键信息
8. **测试层次原则**：
   - ✅ **应该测试 Service 层**：业务逻辑的核心，单元测试的主要目标
   - ❌ **不应该测试 Controller 层**：Controller 只是薄层转发，应由集成测试覆盖
9. **禁止跳过测试**：
   - ❌ 不要在生成的测试类或测试方法上添加 `@Ignore`、`@Disabled`
   - ❌ 不要为了规避真实数据、环境地址、登录态缺失而默认跳过测试
   - ✅ 缺少真实数据时，先向用户列出所需数据项并等待补充，然后继续生成和执行测试
   - ✅ 测试执行失败时优先修复测试或说明真实环境阻塞，尽量把所有生成的测试跑完
10. **异常测试重跑要求**：
   - 首次失败后只定位并记录失败类/方法、失败原因和建议重跑命令，不要在同一次 Skill 流程里自动重跑
   - 用户重新执行 Skill 并明确要求"重跑异常单元测试"时，才进入重跑模式
   - 重跑模式优先只跑失败方法或失败类，不要盲目跑全量测试
   - 若同一失败重跑后仍失败，继续分析新日志；确认是被测代码缺陷或外部阻塞时，停止改弱测试并记录原因

## 执行命令

```bash
# 运行单个测试类
mvn test -Dtest=ServiceNameTest

# 运行单个测试方法
mvn test -Dtest=ServiceNameTest#testMethodName

# 重跑模式：重跑多个失败测试类
mvn test -Dtest=ServiceNameTest,OtherServiceTest

# 重跑模式：重跑失败测试方法
mvn test -Dtest=ServiceNameTest#testMethodName

# 运行模块的所有测试
cd opp-material && mvn test

# 生成测试报告（Surefire 插件）
mvn surefire:test

# 生成覆盖率报告
cd opp-material && mvn jacoco:report
```

**单元测试报告生成：**
- **报告路径**：`docs/junit/{需求号}/`
- **报告内容**：
  - 测试执行结果摘要
  - 测试覆盖率统计
  - 性能或新旧返参对比数据（如有新旧对比测试）
  - 失败用例详情（如有）
  - 异常测试清单：首次失败命令、失败类/方法、原因摘要、建议重跑命令
  - 用户触发重跑后的记录：重跑命令、重跑结果、仍失败原因（如有）
- **报告格式**：HTML + XML 格式，便于后续集成和分析

## 常见问题

**Q: 对比结果为 false？**  
A: 查看 `CompareUtil.deepCompare` 的详细输出，定位不一致的字段。

**Q: 新旧对比时，新实现可以在测试类里手动组装结果吗？**  
A: 不可以。新实现必须直接调用 `@Autowired` 注入的 Service/实现类方法；测试类不能复制业务逻辑、Controller 分支、SQL 聚合或 VO 组装代码。如果没有可调用的 Service 方法，先提示用户确认调用点或是否需要将业务逻辑下沉到 Service。

**Q: 如何确定测试参数值？**  
A: 查看现有测试用例、生产日志或使用数据库真实数据 ID。

**Q: 新接口没有测试环境？**  
A: 先在本地运行服务，使用 `localhost:port` 进行测试。

**Q: 新旧对比测试缺少真实 activityId、用户编号或旧接口地址怎么办？**  
A: 不要生成 `@Ignore` 测试。先暂停并提示用户补充最小必要真实数据；拿到数据后再生成测试并执行。

**Q: 测试因为环境或依赖问题跑不完怎么办？**  
A: 先尝试修复可控问题；如果是外部环境、网络、权限或依赖缺失导致无法继续，报告已执行命令、通过/失败数量和明确阻塞原因，不能静默跳过。

**Q: 单元测试失败后怎么处理？**  
A: 首次执行时先解析输出和 `target/surefire-reports` 定位失败类/方法，并写入异常测试清单和建议重跑命令；不要自动重跑。用户重新执行 Skill 并说明"重跑异常单元测试"后，再用 `-Dtest=ClassName#methodName` 或 `-Dtest=ClassName` 重跑失败项。

**Q: 重跑异常单元测试时会重新生成测试代码吗？**  
A: 默认不会。重跑模式优先读取上次报告或 `target/surefire-reports`，只重跑异常测试；只有失败原因明确是测试代码问题时，才修复测试后再重跑。

**Q: 还需要选择三种测试场景吗？**  
A: 不需要。Skill 会自动判断新增接口和修改接口；只有检测到旧接口被修改时，才向用户确认是否需要新增新旧接口返参对比测试。

**Q: 能否跳过确认直接生成？**  
A: 只有用户明确要求“自动判断并直接生成”或在描述说明中指定完整策略时才可以。否则对于修改接口必须先询问是否需要新旧对比测试。

**Q: 单元测试报告保存在哪里？**  
A: 报告会自动生成到 `docs/junit/{需求号}/` 目录下，其中 `{需求号}` 需要从 Git commit 信息或用户输入中提取。如果无法提取需求号，需要向用户询问。

**Q: 如何确定需求号？**  
A: 优先从 Git commit 信息中提取（如 `feat(166502): xxx` 中的 `166502`），如果无法提取则询问用户。

---

**相关文档：**
- [QUICKSTART.md](QUICKSTART.md) - 快速开始指南
- [templates/README.md](templates/README.md) - 工具类模板说明
