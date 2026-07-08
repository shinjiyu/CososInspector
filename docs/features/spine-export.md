# Spine 节点资源导出（内存 PNG）

## 思路

不依赖 HAR 对齐 UUID，直接从运行时 `skeletonData.textures` 用 **readPixels / WebGL / 内存缓冲** 提取整张图集 PNG。

## 使用

1. 选中带 `sp.Skeleton` 的节点
2. Inspector 中 Skeleton 组件旁点击 **「导出 Spine」**
3. 下载 `{节点名}_{骨架名}_spine.zip`（内含 `IMPORT_README.txt`）

解压到 Creator 工程（可选 CLI）：

```powershell
npm run unpack-spine -- C:\Downloads\intro_intro_spine.zip D:\workspace\proj\assets\spine\intro
```

## Zip 内容

```
IMPORT_README.txt      # Creator 导入说明
manifest.json          # 导出元数据、atlasPages、提取方式（exporter: cocos-inspector-spine-v2）
{骨架名}/{骨架名}.json  # 或 .skel（二进制）
{骨架名}/{骨架名}.atlas
{骨架名}/{atlas页名}    # 与 .atlas 各页名称一致，如 intro.webp、intro.jpg（PNG 像素，扩展名对齐 atlas）
```

## 多页图集（Creator 导入）

Spine 多页 atlas 时，Creator 按 **`.atlas` 里每页第一行的文件名** 在同目录找贴图，并写入 `SkeletonData.textures` / `textureNames`。

- 导出 zip 内纹理名 **不再** 追加 `.png` 后缀（避免 `intro.jpg.png` 无法匹配 `intro.jpg`）
- `manifest.atlasPages` 列出各页名称，导入前核对
- 与 `{名}.json`、`{名}.atlas` 放在同一文件夹，reimport json 即可

## 纹理提取顺序

1. WebGL FBO / device copy
2. `texture.readPixels` 全图
3. ImageAsset 原始 buffer
4. DOM / URL（仅兜底）

## 限制

- 需 `skeletonData` 已加载且纹理在 GPU 上
- 压缩格式纹理若 readPixels 失败，会记录在 manifest.log
- 不含自定义脚本；仅 Spine 资源三件套 + PNG

## 实现

- `src/cocos3/spineExport.ts`
- `src/cocos3/textureExtract.ts` → `extractFullTexturePixels`
- `src/cocos3/texturePng.ts`

## 后续

- Sprite 节点：同类「导出 Sprite PNG」
- Particle：plist + 纹理 PNG
- 整场景：按节点类型逐个导出后合并
