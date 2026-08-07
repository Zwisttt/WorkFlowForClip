#!/bin/bash

# MatrixFlow Excel嵌入图片功能快速测试
# 使用方法: ./quick-test.sh

echo "================================"
echo "MatrixFlow Excel嵌入图片功能测试"
echo "================================"
echo ""

# 1. 创建测试Excel文件
echo "📝 步骤 1/4: 创建测试Excel文件..."
node create-test-excel.js
if [ $? -ne 0 ]; then
    echo "❌ 创建测试文件失败"
    exit 1
fi
echo ""

# 2. 测试图片提取
echo "🔍 步骤 2/4: 测试图片提取功能..."
node test-embedded-image.js test-embedded-images.xlsx
if [ $? -ne 0 ]; then
    echo "❌ 图片提取测试失败"
    exit 1
fi
echo ""

# 3. 类型检查
echo "🔧 步骤 3/4: TypeScript类型检查..."
npm run typecheck > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ 类型检查失败"
    exit 1
fi
echo "✅ TypeScript类型检查通过"
echo ""

# 4. 构建测试
echo "🏗️  步骤 4/4: 构建项目..."
npm run build > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ 构建失败"
    exit 1
fi
echo "✅ 项目构建成功"
echo ""

echo "================================"
echo "✅ 所有测试通过！"
echo "================================"
echo ""
echo "📄 生成的文件："
echo "  - test-embedded-images.xlsx (测试Excel文件)"
echo "  - test-image.png (测试图片)"
echo ""
echo "📖 使用说明："
echo "  查看 EMBEDDED_IMAGES_GUIDE.md"
echo ""
echo "🚀 下一步："
echo "  1. 启动应用: npm run dev"
echo "  2. 导入测试Excel文件测试完整流程"
echo "  3. 或者在Excel中手动插入图片后导入"
echo ""
