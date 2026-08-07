#!/bin/bash

# MatrixFlow - Excel图片功能完整测试
# 包含：传统嵌入图片 + DISPIMG公式图片

echo "========================================"
echo "MatrixFlow Excel图片功能完整测试"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数
PASSED=0
FAILED=0

# 测试函数
run_test() {
    local test_name=$1
    local test_cmd=$2

    echo -e "${YELLOW}▶ 测试: $test_name${NC}"

    if eval "$test_cmd" > /dev/null 2>&1; then
        echo -e "${GREEN}  ✅ 通过${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}  ❌ 失败${NC}"
        ((FAILED++))
        return 1
    fi
}

echo "第1部分: 代码验证"
echo "-----------------------------------"
run_test "TypeScript类型检查" "npm run typecheck"
run_test "项目构建" "npm run build"
echo ""

echo "第2部分: 传统嵌入图片测试"
echo "-----------------------------------"
if [ ! -f "test-embedded-images.xlsx" ]; then
    echo "  ⚠️  创建测试文件..."
    node create-test-excel.js > /dev/null 2>&1
fi

run_test "创建测试Excel" "test -f test-embedded-images.xlsx"
run_test "提取传统嵌入图片" "node test-embedded-image.js test-embedded-images.xlsx"
echo ""

echo "第3部分: DISPIMG图片测试"
echo "-----------------------------------"
if [ -f "$HOME/Desktop/自动化剪辑发布模版2.xlsx" ]; then
    run_test "调试DISPIMG单元格" "node debug-excel-cell.js ~/Desktop/自动化剪辑发布模版2.xlsx"
    run_test "提取DISPIMG媒体资源" "node extract-dispimg.js ~/Desktop/自动化剪辑发布模版2.xlsx"
    run_test "提取DISPIMG图片" "node test-dispimg-extract.js ~/Desktop/自动化剪辑发布模版2.xlsx"
else
    echo -e "${YELLOW}  ⚠️  未找到: ~/Desktop/自动化剪辑发布模版2.xlsx${NC}"
    echo "  跳过DISPIMG测试"
fi
echo ""

echo "第4部分: 文件验证"
echo "-----------------------------------"
run_test "临时目录存在" "test -d /tmp/matrixflow-excel-images"

if [ -d "/tmp/matrixflow-excel-images" ]; then
    IMAGE_COUNT=$(ls -1 /tmp/matrixflow-excel-images/*.png 2>/dev/null | wc -l)
    echo "  📊 提取的图片数量: $IMAGE_COUNT"

    if [ $IMAGE_COUNT -gt 0 ]; then
        echo "  📁 图片列表:"
        ls -lh /tmp/matrixflow-excel-images/*.png | tail -5 | awk '{print "     " $9 " (" $5 ")"}'
    fi
fi
echo ""

echo "========================================"
echo "测试结果汇总"
echo "========================================"
echo -e "${GREEN}✅ 通过: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}❌ 失败: $FAILED${NC}"
fi
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 所有测试通过！${NC}"
    echo ""
    echo "📖 功能说明文档:"
    echo "   - DISPIMG_SUPPORT.md (DISPIMG功能)"
    echo "   - EMBEDDED_IMAGES_GUIDE.md (嵌入图片功能)"
    echo "   - UPDATE_SUMMARY.md (更新总结)"
    echo ""
    echo "🚀 下一步:"
    echo "   1. 启动应用: npm run dev"
    echo "   2. 导入Excel测试完整流程"
    echo "   3. 查看开发者工具日志"
    echo ""
else
    echo -e "${RED}⚠️  部分测试失败，请检查错误信息${NC}"
    exit 1
fi
