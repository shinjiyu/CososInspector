# FastSpin H5 游戏框架结构分析

## 概述

FastSpin 是一个专门为 HTML5 老虎机游戏开发的自研框架，基于 Canvas/WebGL 渲染，集成了 Spine 和 Lottie 动画系统。

## 目录结构

```
/touch/fsnew/
├── common.json                    # 全局配置文件
├── fscommon/                      # 公共组件库
│   ├── components/
│   │   ├── lib/
│   │   │   └── lib_mm-*.js       # 核心运行时库
│   │   ├── h5app/
│   │   │   ├── js/
│   │   │   │   ├── polyfills-legacy-*.js
│   │   │   │   └── setup-*.js
│   │   │   └── assets/           # Lottie 动画资源
│   │   ├── assets/
│   │   │   ├── logo/             # Logo 图片
│   │   │   ├── fonts/            # 字体文件
│   │   │   ├── zh_CN.*.json      # 公共语言包
│   │   │   ├── controlbar_*.json # 控制栏 Spine 动画
│   │   │   └── *.mp3             # 公共音效
│   │   └── thumbnail/            # 游戏缩略图
│   └── ...
├── {version}/                     # 版本目录 (如 20240901P)
│   ├── spade/
│   │   └── slot-*.js             # 老虎机核心逻辑
│   ├── assets/
│   │   ├── zh_CN.*.json          # 版本语言包
│   │   └── fast_common.*.json    # 通用精灵图
│   └── games/
│       └── {gameName}/           # 具体游戏目录
│           ├── index.jsp         # 入口页面
│           ├── project.json      # 游戏配置文件
│           ├── css/
│           │   └── game-*.css
│           ├── js/
│           │   └── game-*.js     # 游戏逻辑
│           └── assets/           # 游戏资源
│               ├── *.json        # Spine/精灵图配置
│               ├── *.atlas       # Spine 纹理图集
│               ├── *.png         # 纹理图片
│               ├── *.xml         # BitmapFont 配置
│               ├── *.mp3/*.ogg   # 音效文件
│               └── h5/           # H5 特定资源
```

## 核心配置文件

### 1. common.json (全局配置)

```json
{
  "service": "ws://...",           // WebSocket 服务地址
  "thumbnailPath": "...",          // 缩略图路径
  "currencyList": { ... },         // 货币符号映射
  "debugMode": 0,                  // 调试模式
  "showFPS": false,                // 显示帧率
  "autoSelectTime": 30,            // 自动选择时间
  "autoSpinDuration": { ... }      // 自动旋转配置
}
```

### 2. project.json (游戏配置)

```json
{
  "version": "2025.12.29.15.09",   // 版本号
  "assetsMode": 0,                 // 资源模式
  "fonts": [                       // 字体列表
    { "name": "Arialbd", "url": "..." }
  ],
  "cssList": ["css/game-*.css"],   // CSS 文件列表
  "jsList": [                      // JS 文件列表
    "lib_mm-*.js",                 // 核心库
    "slot-*.js",                   // 老虎机逻辑
    "game-*.js"                    // 游戏逻辑
  ],
  "debugMode": 0
}
```

## 资源格式分析

### 1. Spine 骨骼动画

**JSON 格式** (skeleton data):
```json
{
  "skeleton": {
    "hash": "...",
    "spine": "3.7.92",            // Spine 版本
    "width": 0, "height": 0
  },
  "bones": [...],                  // 骨骼数据
  "slots": [...],                  // 插槽数据
  "skins": { "default": {...} },   // 皮肤数据
  "animations": {...}              // 动画数据
}
```

**Atlas 格式** (纹理图集):
- 二进制格式，包含纹理坐标信息
- 对应 PNG 纹理图片

### 2. TexturePacker 精灵图

```json
{
  "frames": {
    "sprite_name.png": {
      "frame": { "x": 0, "y": 0, "w": 100, "h": 100 },
      "rotated": false,
      "trimmed": true,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 100, "h": 100 },
      "sourceSize": { "w": 100, "h": 100 }
    }
  },
  "meta": {
    "app": "TexturePacker",
    "image": "sprite.png",         // 对应的纹理图片
    "format": "RGBA8888",
    "size": { "w": 1024, "h": 1024 },
    "scale": "1"
  }
}
```

### 3. Lottie 动画

```json
{
  "v": "5.7.11",                   // Lottie 版本
  "fr": 30,                        // 帧率
  "ip": 0,                         // 起始帧
  "op": 60,                        // 结束帧
  "w": 134, "h": 134,              // 尺寸
  "nm": "animation_name",
  "assets": [...],                 // 资源引用
  "layers": [...]                  // 图层数据
}
```

### 4. BitmapFont 字体

XML 格式，定义字符到精灵图的映射关系。

### 5. 语言包

```json
{
  "KEY_NAME": "翻译文本",
  "TXT_SLOT_WIN_LINE": "线号:%d 赢: %s"
}
```

## 资源加载流程

1. **加载 project.json** - 获取游戏配置
2. **加载 JS 文件** - 按顺序加载脚本
3. **加载 CSS 文件** - 样式表
4. **加载字体** - 自定义字体
5. **加载语言包** - 本地化文本
6. **加载纹理** - 精灵图和纹理
7. **加载动画** - Spine 和 Lottie
8. **加载音效** - 背景音乐和音效

## 资源命名规则

- **哈希后缀**: `filename.{hash}.ext` (用于缓存控制)
- **语言后缀**: `*_lan_{locale}.json` (语言相关资源)
- **分辨率后缀**: `*_b.atlas` (可能表示不同分辨率)

## 技术栈总结

| 组件 | 技术 | 版本 |
|------|------|------|
| 骨骼动画 | Spine | 3.7.92 |
| UI 动画 | Lottie | 5.7.11 |
| 精灵图 | TexturePacker | - |
| 渲染 | Canvas/WebGL | - |
| 通信 | WebSocket | - |
