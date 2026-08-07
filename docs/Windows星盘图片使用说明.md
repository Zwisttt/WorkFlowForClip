# Windows端星盘图片嵌入使用说明

## 问题描述
在Windows上，当你在Excel表格的"星盘图片"列中直接插入图片文件（而不是填写路径），系统会自动提取图片到临时目录。但可能会遇到"不是绝对路径"或"文件不存在"的错误。

## 解决方案

### 1. 启动程序
双击 `start-windows.bat` 启动程序。首次启动会自动安装：
- Node.js
- Python 3
- Visual Studio C++ Build Tools（如果需要）
- FFmpeg（可选）

### 2. 在Excel中插入图片的正确方法

#### 方法A：插入图片到单元格（推荐）
1. 在Excel中选中"星盘图片"列的单元格
2. 点击菜单：插入 → 图片 → 此设备
3. 选择图片文件
4. 调整图片大小，确保图片位于目标单元格内
5. 保存Excel文件

**注意**：
- 图片必须位于单元格内，不要跨多个单元格
- 支持的格式：PNG, JPG, JPEG, GIF, BMP
- 保存Excel时选择 `.xlsx` 格式（不要用 `.xls`）

#### 方法B：填写绝对路径
直接在单元格中填写完整的绝对路径，例如：
```
C:\Users\YourName\Desktop\星盘图片\chart001.png
D:\素材库\星盘\image.jpg
```

**快速获取绝对路径的方法**：
1. 在文件资源管理器中找到图片
2. 按住 Shift 键，右键点击文件
3. 选择"复制为路径"
4. 粘贴到Excel单元格（删除首尾的引号）

### 3. 调试工具

如果遇到问题，可以使用调试工具检查Excel文件：

```powershell
# 在项目目录下打开PowerShell或命令提示符
node scripts/debug-excel-images.mjs "C:\path\to\your\excel.xlsx"
```

这个工具会显示：
- Excel中有多少张图片
- 图片的位置（行、列）
- 图片提取测试结果
- 临时文件路径是否正确

### 4. 常见问题排查

#### 问题1：提示"路径必须是绝对路径"
**原因**：填写的是相对路径或文件名
**解决**：使用上面"方法B"获取完整绝对路径

#### 问题2：提示"文件不存在"
**原因**：
- 文件路径错误
- 文件已被移动或删除
- 图片提取失败

**解决**：
1. 检查文件是否真的存在
2. 使用调试工具检查Excel文件
3. 查看控制台日志（按F12打开开发者工具）

#### 问题3：插入的图片没有被识别
**原因**：
- 图片格式不支持
- 图片没有保存到Excel文件中（只是链接）
- Excel文件格式不正确

**解决**：
1. 确保使用 `.xlsx` 格式保存
2. 插入图片时选择"嵌入"而不是"链接"
3. 重新保存Excel文件后再导入

### 5. 技术细节

程序会按以下顺序处理星盘图片：

1. **优先读取单元格文本**：如果单元格有文本内容，作为文件路径
2. **提取嵌入图片**：如果单元格为空，尝试提取嵌入的图片
   - 检查DISPIMG公式（WPS表格）
   - 检查传统嵌入图片（Microsoft Excel）
3. **保存到临时目录**：提取的图片保存到：
   - Windows: `C:\Users\YourName\AppData\Local\Temp\matrixflow-excel-images\`
   - macOS: `/var/folders/.../T/matrixflow-excel-images/`

### 6. 查看日志

程序运行时会在控制台输出详细日志：

```
[AutomationWorkbook] 行2：使用嵌入的星盘图片 {
  path: 'C:\\Users\\...\\Temp\\matrixflow-excel-images\\excel-image-xxx.png',
  isAbsolute: true,
  exists: true,
  platform: 'win32'
}
```

如果看到 `isAbsolute: false` 或 `exists: false`，说明提取失败。

### 7. 联系支持

如果问题仍然存在：
1. 保存控制台日志（F12 → Console → 右键 → Save as...）
2. 提供Excel示例文件
3. 提供调试工具的输出结果

## 更新日志

- 2026-08-07: 改进错误提示，分离"路径格式"和"文件存在"两种错误
- 2026-08-07: 添加详细日志输出，包含平台信息和路径验证结果
- 2026-08-07: 添加Excel图片提取调试工具
