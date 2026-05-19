#!/bin/bash
# 检查并创建测试工具类
# 用法: ./check-test-utils.sh <module-name>
# 例如: ./check-test-utils.sh opp-material

set -e

MODULE=$1
if [ -z "$MODULE" ]; then
    echo "❌ 错误: 请指定模块名称"
    echo ""
    echo "用法: ./check-test-utils.sh <module-name>"
    echo "例如: ./check-test-utils.sh opp-material"
    echo ""
    echo "支持的模块:"
    echo "  - opp-material"
    echo "  - opp-learn"
    echo "  - opp-user"
    echo "  - opp-order"
    echo "  - 其他 opp-* 模块"
    exit 1
fi

# 确定模块的包名（去掉 opp- 前缀）
PACKAGE_NAME=${MODULE#opp-}

# 自动检测工程的包路径
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# 注意：工具类应该放在 test 目录下，不是 main 目录
UTILS_DIR="$MODULE/src/test/java"
TEMPLATE_DIR="$SCRIPT_DIR/templates"

echo "=========================================="
echo "  检查和创建测试工具类"
echo "=========================================="
echo "模块: $MODULE"
echo "模板目录: $TEMPLATE_DIR"
echo "=========================================="
echo ""

# 检查模块目录是否存在
if [ ! -d "$MODULE" ]; then
    echo "❌ 错误: 模块目录不存在: $MODULE"
    exit 1
fi

# 检查模板目录是否存在
if [ ! -d "$TEMPLATE_DIR" ]; then
    echo "❌ 错误: 模板目录不存在: $TEMPLATE_DIR"
    echo "请确保在 project 根目录运行此脚本"
    exit 1
fi

# 自动检测包路径
echo "🔍 正在检测工程的包路径..."
PACKAGE_PATH=$(find "$UTILS_DIR" -type d -name "utils" | head -1 | sed "s|$UTILS_DIR/||" | sed "s|/utils||")

if [ -z "$PACKAGE_PATH" ]; then
    # 如果没找到 utils 目录，尝试查找第一个 Java 文件的包路径
    FIRST_JAVA_FILE=$(find "$UTILS_DIR" -name "*.java" -type f | head -1)
    if [ -n "$FIRST_JAVA_FILE" ]; then
        # 从 Java 文件中提取 package 声明
        PACKAGE_DECL=$(grep "^package " "$FIRST_JAVA_FILE" | head -1 | sed 's/package //;s/;//')
        # 移除最后的子包（如 .controller, .service），保留基础包路径
        PACKAGE_PATH=$(echo "$PACKAGE_DECL" | sed 's/\.[^.]*$//')
        UTILS_DIR="$UTILS_DIR/$PACKAGE_PATH"
    else
        echo "❌ 错误: 无法检测到包路径，请手动指定"
        exit 1
    fi
fi

echo "   ✓ 检测到包路径: $PACKAGE_PATH"
echo "   ✓ Utils 目录: $UTILS_DIR/utils"
echo ""

# 创建 utils 目录（如果不存在）
mkdir -p "$UTILS_DIR/utils"

# 检查 CompareUtil
echo "📦 检查 CompareUtil.java..."
if [ ! -f "$UTILS_DIR/utils/CompareUtil.java" ]; then
    echo "   ✗ 文件不存在，正在创建..."
    cp "$TEMPLATE_DIR/CompareUtil.java" "$UTILS_DIR/utils/"
    
    # 修改包名：将 ${PACKAGE_PATH} 替换为实际检测到的包路径
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|\${PACKAGE_PATH}|${PACKAGE_PATH}|g" "$UTILS_DIR/utils/CompareUtil.java"
    else
        # Linux
        sed -i "s|\${PACKAGE_PATH}|${PACKAGE_PATH}|g" "$UTILS_DIR/utils/CompareUtil.java"
    fi
    
    echo "   ✓ CompareUtil.java 已创建"
else
    echo "   ✓ CompareUtil.java 已存在"
fi

echo ""

# 检查 HttpClientUtil
echo "📦 检查 HttpClientUtil.java..."
if [ ! -f "$UTILS_DIR/utils/HttpClientUtil.java" ]; then
    echo "   ✗ 文件不存在，正在创建..."
    cp "$TEMPLATE_DIR/HttpClientUtil.java" "$UTILS_DIR/utils/"
    
    # 修改包名：将 ${PACKAGE_PATH} 替换为实际检测到的包路径
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|\${PACKAGE_PATH}|${PACKAGE_PATH}|g" "$UTILS_DIR/utils/HttpClientUtil.java"
    else
        # Linux
        sed -i "s|\${PACKAGE_PATH}|${PACKAGE_PATH}|g" "$UTILS_DIR/utils/HttpClientUtil.java"
    fi
    
    echo "   ✓ HttpClientUtil.java 已创建"
else
    echo "   ✓ HttpClientUtil.java 已存在"
fi

echo ""
echo "=========================================="
echo "  验证编译"
echo "=========================================="
echo ""

# 尝试验证编译
cd "$MODULE"
if command -v mvn &> /dev/null; then
    echo "🔨 执行 Maven 编译检查..."
    if mvn clean compile -q -DskipTests 2>&1 | grep -q "BUILD SUCCESS"; then
        echo "   ✓ 编译成功"
    else
        echo "   ⚠ 编译可能存在问题，请手动检查"
        echo "   建议运行: cd $MODULE && mvn clean compile"
    fi
else
    echo "   ⚠ Maven 未安装或未在 PATH 中，跳过编译检查"
fi

cd ..

echo ""
echo "=========================================="
echo "  ✅ 检查完成"
echo "=========================================="
echo ""
echo "下一步："
echo "  1. 在测试类中导入工具类："
echo "     import ${PACKAGE_PATH}.utils.CompareUtil;"
echo "     import ${PACKAGE_PATH}.utils.HttpClientUtil;"
echo ""
echo "  2. 使用静态导入简化代码（可选）："
echo "     import static ${PACKAGE_PATH}.utils.HttpClientUtil.testPostNewAndOlaCompare;"
echo ""
echo "  3. 开始编写单元测试！"
echo ""
