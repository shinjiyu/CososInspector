# FastSpin 资源提取工具

从 FastSpin H5 老虎机游戏中提取和分析资源的工具集。

## 工具列表

### 1. browser-sniffer.js (浏览器端嗅探器)

在浏览器中注入，实时捕获游戏加载的所有资源。

**使用方法:**

1. 打开 FastSpin 游戏页面
2. 打开浏览器开发者工具 (F12)
3. 在 Console 中粘贴 `browser-sniffer.js` 的内容并执行
4. 刷新页面让游戏重新加载
5. 等待游戏完全加载后，使用以下命令：

```javascript
// 查看资源摘要
window.fsExtractor.summary()

// 导出资源列表为 JSON 文件
window.fsExtractor.export('json')

// 导出 URL 列表
window.fsExtractor.export('urls')

// 生成 Shell 下载脚本
window.fsExtractor.generateDownloadScript()

// 下载单个资源
window.fsExtractor.download('https://...')

// 批量下载所有资源 (注意浏览器可能会阻止)
window.fsExtractor.downloadAll()

// 解包精灵图
const sprites = await window.fsExtractor.unpackSpriteSheet(resource)
```

### 2. download-resources.js (Node.js 下载器)

从命令行下载游戏资源。

**使用方法:**

```bash
node download-resources.js <game_url> [output_dir]

# 示例
node download-resources.js "https://go.fastspindemo.com/touch/fsnew/20240901P/games/fortunejewels2/index.jsp" ./output
```

### 3. extractor.js (核心库)

提供资源分析和处理的核心功能，可在浏览器或 Node.js 中使用。

## 资源类型

| 类型 | 说明 | 文件格式 |
|------|------|----------|
| spine_skeleton | Spine 骨骼数据 | .json |
| spine_atlas | Spine 纹理图集 | .atlas |
| lottie | Lottie 动画 | .json |
| sprite_sheet | TexturePacker 精灵图 | .json |
| texture | 纹理图片 | .png, .jpg |
| audio | 音效文件 | .mp3, .ogg |
| font | 字体文件 | .ttf, .xml |
| locale | 语言包 | .json |
| config | 配置文件 | .json |

## 框架结构

详见 [framework-structure.md](../fastspin-analysis/framework-structure.md)

## 注意事项

1. **版权声明**: 此工具仅供学习和研究使用，请勿用于商业目的或侵犯版权。

2. **跨域限制**: 由于浏览器的同源策略，某些资源可能无法直接下载。建议使用 Node.js 下载器或配置代理。

3. **哈希文件名**: FastSpin 使用哈希后缀来管理缓存 (如 `file.abc123.png`)。实际提取时需要从网络请求中获取完整 URL。

4. **资源加密**: 部分资源可能经过加密或混淆处理，需要额外的解密步骤。

## 示例输出

```
========================================
FastSpin Resource Summary
========================================
spine_skeleton: 25 files
spine_atlas: 25 files
lottie: 3 files
sprite_sheet: 8 files
texture: 40 files
audio: 30 files
font: 6 files
locale: 4 files
config: 5 files

Total: 146 resources
========================================
```
