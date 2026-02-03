# FastSpin 游戏引擎逆向分析工作流

## 概述

本工作流用于从 HAR 文件中提取、分析和逆向 FastSpin 老虎机游戏引擎的代码和资源。

## 工具清单

| 工具 | 用途 | 命令 |
|------|------|------|
| `har-extract.js` | 从 HAR 提取 JS 代码 | `node har-extract.js <har-file>` |
| `lzma-decompressor.js` | 解压 LZMA 压缩的代码 | `node lzma-decompressor.js <js-file>` |
| `resource-extractor.js` | 从 HAR 提取所有资源 | `node resource-extractor.js <har-file>` |
| `resource-classifier.js` | 按功能分类资源 | `node resource-classifier.js <input-dir>` |

---

## 完整工作流

### 第一步：获取 HAR 文件

1. 打开 Chrome 开发者工具 (F12)
2. 切换到 Network 标签
3. 勾选 "Preserve log"
4. 访问目标游戏页面
5. 右键点击任意请求 → "Save all as HAR with content"

### 第二步：提取 JavaScript 代码

```bash
cd tools/fastspin-extractor
node har-extract.js ../../go.fastspindemo.com.har ./extracted
```

**输出目录结构**:
```
extracted/
├── component/     # 组件代码
├── lib/           # 第三方库
├── slot/          # 老虎机逻辑
├── game/          # 游戏逻辑
├── other/         # 其他代码
└── analysis-report.json
```

### 第三步：解压 LZMA 压缩代码

部分核心代码使用 LZMA 压缩 (以 `eval(function(n){...})` 开头)。

```bash
node lzma-decompressor.js ./extracted/slot/slot-d6b7a2a978.js
node lzma-decompressor.js ./extracted/game/game-d7bd12fd2e.js
```

**输出**:
```
extracted/slot/slot_decompressed.js
extracted/slot/slot_decompressed_analysis.json
extracted/game/game_decompressed.js
extracted/game/game_decompressed_analysis.json
```

### 第四步：提取游戏资源

```bash
node resource-extractor.js ../../go.fastspindemo.com.har ./resources
```

**输出目录结构**:
```
resources/
├── images/        # PNG/JPG 图片 (133 个)
├── spine/         # Spine Atlas 文件 (86 个)
├── spritesheets/  # 精灵图集 JSON (67 个)
├── audio/         # 音频文件 (31 个)
├── fonts/         # 字体文件 (22 个)
├── js/            # JavaScript 文件 (11 个)
├── css/           # CSS 样式 (2 个)
├── html/          # HTML 文件 (1 个)
├── RESOURCE_STRUCTURE.md
└── resource-analysis.json
```

### 第五步：按功能分类资源

```bash
node resource-classifier.js ./resources ./resources-by-feature
```

**输出目录结构**:
```
resources-by-feature/
├── symbols/          # 老虎机符号 (95 个)
├── intro_freegame/   # 开场/免费游戏 (49 个)
├── bigwin/           # 大奖动画 (36 个)
├── wheel_multiplier/ # 转盘/乘数 (34 个)
├── audio/            # 音频资源 (31 个)
├── luckybet/         # 幸运投注 (27 个)
├── controlbar/       # 控制栏 UI (17 个)
├── common/           # 通用资源 (15 个)
├── line_effects/     # 线奖效果 (14 个)
├── scripts/          # JS 代码 (10 个)
├── background/       # 游戏背景 (9 个)
├── fonts/            # 字体 (6 个)
├── localization/     # 多语言 (2 个)
├── styles/           # CSS (2 个)
└── CLASSIFICATION_REPORT.md
```

---

## 一键执行脚本

```bash
#!/bin/bash
# run-all.sh - 完整分析流程

HAR_FILE=$1
OUTPUT_DIR=${2:-"./output"}

echo "=== FastSpin 引擎分析工具 ==="
echo "HAR 文件: $HAR_FILE"
echo "输出目录: $OUTPUT_DIR"

# 1. 提取 JS 代码
echo "[1/4] 提取 JavaScript 代码..."
node har-extract.js "$HAR_FILE" "$OUTPUT_DIR/extracted"

# 2. 解压 LZMA 代码
echo "[2/4] 解压 LZMA 压缩代码..."
for f in "$OUTPUT_DIR/extracted/slot/"*.js "$OUTPUT_DIR/extracted/game/"*.js; do
  if head -c 20 "$f" | grep -q "eval(function"; then
    node lzma-decompressor.js "$f"
  fi
done

# 3. 提取资源
echo "[3/4] 提取游戏资源..."
node resource-extractor.js "$HAR_FILE" "$OUTPUT_DIR/resources"

# 4. 功能分类
echo "[4/4] 按功能分类资源..."
node resource-classifier.js "$OUTPUT_DIR/resources" "$OUTPUT_DIR/resources-by-feature"

echo "=== 分析完成 ==="
echo "代码: $OUTPUT_DIR/extracted/"
echo "资源: $OUTPUT_DIR/resources-by-feature/"
```

---

## 分析报告清单

### 代码分析
| 文件 | 内容 |
|------|------|
| `ENGINE_ANALYSIS.md` | 引擎架构分析 |
| `RUNTIME_LOGIC_ANALYSIS.md` | 运行时逻辑分析 |
| `analysis-report.json` | 代码结构 JSON |
| `*_decompressed_analysis.json` | 解压代码分析 |

### 资源分析
| 文件 | 内容 |
|------|------|
| `RESOURCE_STRUCTURE.md` | 资源结构总览 |
| `RESOURCE_SEGMENTATION.md` | 资源分割详解 |
| `CLASSIFICATION_REPORT.md` | 功能分类报告 |
| `resource-analysis.json` | 资源统计 JSON |

---

## 技术发现摘要

### 引擎技术栈
- **渲染**: PixiJS (WebGL 2D)
- **动画**: GSAP + Spine
- **框架**: 自定义 mm 框架 (类似 Cocos2d-x)
- **模块**: RequireJS
- **UI 库**: jQuery 2.2.4

### 核心类
```
mm.Class        - 类继承系统
mm.Layer        - 图层基类
mm.Action       - 动作系统
BaseGameManager - 游戏主控制器
Reel            - 转轴组件
Symbol          - 符号组件
Service         - 网络通信
SoundManager    - 音频管理
```

### 状态机
```
SlotStatus = {
  NORMAL: 0,    // 正常状态
  SPIN: 1,      // 旋转中
  RESULT: 2,    // 等待结果
  STOP: 3,      // 停止中
  WILD: 4,      // Wild 特效
  COUNTING: 5,  // 计算奖金
  TAKE: 6,      // 领取奖金
  FREE: 7,      // 免费游戏
  BONUS: 8      // 奖励游戏
}
```

### 资源命名规则
```
{name}.{hash}.{ext}

示例:
sym_0.1782c37c.json   → 符号0 Spine 数据
sym_0.f45d4934.png    → 符号0 纹理图集
controlbar_spin.030001b8.atlas → 控制栏 Spin 按钮
```

---

## 文件对照表

| 原始文件 | 用途 |
|----------|------|
| `app-*.js` | 主框架 (PixiJS + jQuery + GSAP) |
| `lib_mm-*.js` | mm 自定义框架 |
| `slot-*.js` | 老虎机核心逻辑 (LZMA 压缩) |
| `game-*.js` | 游戏业务逻辑 (LZMA 压缩) |
| `vendor-legacy-*.js` | 第三方依赖 |
| `polyfills-legacy-*.js` | Polyfills |

---

## 使用示例

### 分析新游戏

```bash
# 1. 录制 HAR
# 2. 运行分析
node har-extract.js new-game.har ./new-game/extracted
node resource-extractor.js new-game.har ./new-game/resources
node resource-classifier.js ./new-game/resources ./new-game/resources-by-feature

# 3. 查看报告
cat ./new-game/extracted/analysis-report.json
cat ./new-game/resources-by-feature/CLASSIFICATION_REPORT.md
```

### 查找特定代码

```bash
# 搜索状态机
grep -r "SlotStatus" ./extracted/

# 搜索事件绑定
grep -r "emitter.on" ./extracted/

# 搜索 Spine 动画
grep -r "spineName" ./extracted/
```

---

## 版本信息

- 工具版本: 1.0
- 创建日期: 2026-02-03
- 目标引擎: FastSpin (PixiJS-based)
