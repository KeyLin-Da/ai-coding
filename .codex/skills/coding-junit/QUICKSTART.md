# 后端接口单元测试 Skill - 快速使用指南

## 📁 目录结构

```
<skill-directory>/
├── SKILL.md              # 完整文档
├── QUICKSTART.md         # 快速开始指南
├── check-test-utils.sh   # 自动化检查脚本
└── templates/
    ├── CompareUtil.java      # 对象对比工具模板
    ├── HttpClientUtil.java   # HTTP客户端工具模板
    └── README.md             # 模板详细说明
```

## 🚀 快速开始（3步）

### 💡 核心理念

**用户只需提供模块名，Skill 会自动完成所有工作！**

```bash
# 用户使用方式（示例）
generate-unit-test opp-material
```

### 📝 完整示例

#### 第 1 步：检查并创建工具类

```bash
cd .codex/skills/coding-junit
chmod +x check-test-utils.sh  # 首次使用需要添加执行权限
./check-test-utils.sh opp-material
```

**脚本会自动：**
- ✅ 检测工程的实际包路径
- ✅ 从模板复制 CompareUtil.java 和 HttpClientUtil.java
- ✅ 自动替换包路径占位符
- ✅ 验证编译是否通过

#### 第 2 步：查看生成的文件

```bash
ls opp-material/src/test/java/com/infinitus/opp/material/utils/
# 输出：CompareUtil.java  HttpClientUtil.java
```

#### 第 3 步：编写测试代码

参考 SKILL.md 中的三种场景模板编写测试代码。

#### 第 4 步：运行测试

```bash
cd opp-material
mvn test -Dtest=ServiceNameTest
```

### 🔧 核心工具

- **CompareUtil**: `deepCompare(oldObj, newObj)` - 深度对比任意对象
- **HttpClientUtil**: `testPostNewAndOlaCompare(...)` - 新旧接口对比（自动识别）

#### 场景 A：修改已有接口
- **特征：** Service 方法签名未变，内部逻辑调整
- **策略：** 针对改动点补充专项测试用例

#### 场景 B：性能优化接口
- **特征：** 功能不变，仅优化实现方式
- **策略：** 使用 `testPostNewAndOlaCompare` 进行新旧对比

#### 场景 C：新增接口
- **特征：** 全新的 Service 方法
- **策略：** 生成基础测试 + 边界测试 + 组合条件测试

## 🔧 核心工具

### CompareUtil
- `deepCompare(oldObj, newObj)` - 深度对比任意对象
- 支持 Map、List、数组、嵌套对象
- 自动识别并解析 JSON 字符串

### HttpClientUtil
- `testPostNewAndOlaCompare(...)` - POST 接口对比
- `testGetNewAndOlaCompare(...)` - GET 接口对比
- 自动生成测试 token

## 📖 详细文档

- **完整指南：** [SKILL.md](SKILL.md)
- **模板说明：** [templates/README.md](templates/README.md)

## ⚡ 常用命令

```bash
# 运行单个测试类
mvn test -Dtest=MatTopicInfoServiceTest

# 运行单个测试方法
mvn test -Dtest=MatTopicInfoServiceTest#testFindByPageUse2

# 运行指定模块的所有测试
cd opp-material && mvn test
```

## ❓ 常见问题

**Q: 脚本执行失败？**  
A: 确保在项目根目录执行，并检查模块名称是否正确

**Q: 对比结果为 false？**  
A: 查看 `CompareUtil.deepCompare` 的详细输出，定位差异字段

---

**更多信息请查阅：[SKILL.md](SKILL.md)**
