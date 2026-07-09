# Inspector → Creator 场景恢复

## 架构

```text
试玩页 (Chrome + Cocos Inspector 扩展)
  └─ __cocosInspectorApi.exportSceneSnapshot()
        ↓ WebSocket :17373
MCP cocos-inspector (Cursor)
  └─ cocos_export_scene_snapshot → snapshot.json
        ↓
scene-to-creator.mjs + cocosmcp (Creator :3921)
  └─ 磁盘复制模板 scene → create-node 重建树 → save-scene
```

## 1. 恢复 Inspector MCP

### 终端 1：常驻桥接

```powershell
cd D:\UGit\CososInspectorNew
npm run build          # 改过 src 后
npm run cocos-bridge   # 保持运行
```

### Cursor MCP

已在 `~/.cursor/mcp.json` 注册 `cocos-inspector`（`COCOS_PAGE_URL_MATCH=godeebxp`）。

**重载 Cursor MCP** 后可用工具：

| 工具 | 作用 |
|------|------|
| `cocos_list_tabs` | 扩展是否连上桥接 |
| `cocos_get_scene_tree` | 轻量节点树 |
| `cocos_export_scene_snapshot` | 完整快照 JSON |
| `cocos_list_sprites` | Sprite 列表 |

### 试玩页

1. 普通 Chrome 打开试玩页（URL 含 `godeebxp`）
2. 加载扩展，F5 刷新
3. 面板 MCP 指示应为绿色「已连接」

## 2. 导出场景快照

MCP 调用示例：

```json
{
  "outPath": "D:/UGit/CososInspectorNew/tmp/scene-snapshot.json",
  "maxNodes": 3000,
  "includeComponents": true
}
```

快照包含：节点树、Transform、UITransform、组件摘要（Sprite/Spine/Label 等）。

当前 Phase 2 重建 **节点层级 + Transform + UITransform/Canvas 设计分辨率 + Sprite 纹理绑定**（Spine/Label/脚本仍待做）。

**UITransform 尺寸**：Canvas 子节点 `create-node` 时已自带 `cc.UITransform`，重建脚本只用 `set-property` 改 `contentSize`/`anchorPoint`，**不要**再 `create-component cc.UITransform`（会刷屏报错）。若内存未落盘，由 `scene-patch-disk.mjs` 的 `patchUiSizesOnDisk` 写磁盘补救。

**Sprite.sizeMode**：优先读快照 `spriteFrame.sizeMode`，其次读组件行 `尺寸模式`（0=TRIMMED，1=RAW，2=CUSTOM）。`symbolSprite` 等图集符号通常为 CUSTOM，须配合 UITransform 显示尺寸。

**Sprite 纹理读取**：Inspector 提供 **双路径对比**——左侧「当前路径」（legacy：webgl rect 裁切 + displaySize 缩放），右侧「引擎对齐」（engine：atlas 直裁 + originalSize+offset trim 合成）。

- **下载/导出默认走 engine 对齐路径**（`exportSpritePngBase64({ path: 'auto' })`：有 `enginePixels` 用 engine，否则回退 legacy）。engine 输出已是 originalSize 全图，**不再二次拉伸**。
- `downloadTexture(nodeId, { path })` 可显式指定 `'engine' | 'legacy' | 'auto'`；返回 `detail.usedPath` 标注实际路径，`detail.extractMethod` 反映该路径方法（engine 时为 `engine-trim` 等）。
- MCP 批量走 **share 文件通道**；`scene-to-creator.mjs --with-textures` 默认吃到 engine originalSize PNG，正好契合 `resetSpriteMetaTrimOnDisk` 的全图 meta。

**资源导出按钮（Inspector）**：选中节点后，组件头部按类型显示导出按钮：

- **导出 Spine**（`sp.Skeleton`）：内存读骨架 json/skel + `.atlas` + 多页纹理，打包 zip，纹理名与 atlas 页一致。
- **导出 BMFont**（使用 `BitmapFont` 的 `cc.Label`）：从运行时 `fntConfig` 重建 AngelCode `.fnt`（`base` 近似取 `lineHeight`，`kerning` 可解码时输出），图集 `spriteFrame.texture` 走 `extractFullTexturePixels` 转 PNG，附 `fntConfig.json` 兜底与 `IMPORT_README.txt`，打包 `<node>_<font>_bmfont.zip`。`.fnt` 与 png 同目录拖入 Creator 即识别为 BitmapFont。

**`.meta`**：`resetSpriteMetaTrimOnDisk` 设 `trimType:'none'`；补丁后勿 `refresh-asset`（Creator 会 re-trim）。

**Mask 裁剪**：快照中带 `cc.Mask` 的节点（含 `SymbolView` 752×500）由 `patchMasksOnDisk` 补 `cc.Graphics` + `cc.Mask`，避免符号溢出格子。

**零尺寸**：`0×56`、`0×0` 等合法尺寸必须写入磁盘（勿用 `if (width && height)` 跳过）。

**补丁后查看**：关闭场景选「不保存」→ 重新打开；若在 Creator 里保存会覆盖磁盘补丁。

一键修复当前场景：

```powershell
node tools/mcp-cocos-inspector/repair-scene-all.mjs tmp/godeebxp-texture-manifest.json tmp/godeebxp-scene-snapshot.json
```

纹理传输：**share 文件通道**（HTTP PUT → `out/`，WS 只返 `sharePath`）。

**`.meta` 禁止 refresh-asset 后 auto-trim**（见上）。

**调试画框**：用 `node tools/mcp-cocos-inspector/draw-node-bounds.mjs`（内联 `evalPage`），勿在面板加临时按钮。

## 3. 在 Creator 重建（Phase 2）

Creator 已开 + `cocosmcp` 连 `testAutoCopy`（多开时按 `instances.json` 解析端口，勿连 `symbolEditor`）：

```powershell
npm run cocos-scene-to-creator -- tmp/godeebxp-scene-snapshot.json `
  --project D:/workspace/testAutoCopy `
  --scene assets/scene/godeebxp_recovered.scene `
  --clear --with-textures --refresh-snapshot `
  --page-url-match godeebxp `
  --manifest tmp/godeebxp-texture-manifest.json `
  --max-nodes 2000 --max-sprites 600
```

脚本会读取 `%LOCALAPPDATA%/cocos-meta-mcp/instances.json`，将 `--project` 映射到正确 HTTP 端口（`testAutoCopy` → 3921）。

| 参数 | 作用 |
|------|------|
| `--clear` | 删除旧 scene 文件并清空场景子节点后重建 |
| `--with-textures` | 批量 `downloadTexture(originalCanvas)` → 写入 `assets/recovered/godeebxp/sprites/` |
| `--refresh-snapshot` | 先从试玩页重新导出快照 |
| `--page-url-match` | 精确匹配 tab URL 片段 |
| `--live-sprites` | 预缓存的 `listSprites` JSON；快照 nodeId 与试玩页不一致时按 **path** 匹配 live id 再 `downloadTexture` |

### Inspector MCP 纹理能力

| 工具 | 传输方式 |
|------|----------|
| `cocos_download_texture` | 默认 **share**：试玩页 PUT → `out/`，WS 返 `sharePath`；可选 `delivery:inline` 走 base64 |
| `cocos_texture_extract_logs` | 读试玩页 **localStorage** 环形缓冲（`cocos-inspector-texture-logs`），不经浏览器 console；可按 `nodeUUID` 过滤 |
| `cocos_replace_texture` | 上传优先 **`imagePath`（文件拷入 `in/`）**；小图可用 `imageBase64` |
| `scene-to-creator --with-textures` | **share 通道**：`copyFile(share/out → Creator assets)` |

大图/批量场景恢复应使用 **文件落盘**，避免 WebSocket 塞满 base64。

## 4. 完整恢复路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| A | 单 Spine 节点导出 + Creator 创建 | ✅ 已验证 |
| B | MCP 场景快照 + 节点树重建 | 🔄 本次 |
| C | 批量导出 Sprite/Spine 资源并绑定 | 待做 |
| D | 自定义脚本组件占位 / TS 还原 | 待做 |

## 实现文件

- `src/cocos3/shareUpload.ts` — 试玩页 HTTP PUT 写入共享 out/
- `src/cocos3/spriteDownload.ts` — trim 精灵 PNG 导出（`originalCanvas` / `frame` / `scale`）
- `src/cocos3/spineExport.ts` — Spine 资源导出（骨架 + atlas + 多页纹理 zip）
- `src/cocos3/bmfontExport.ts` — BMFont 资源导出（重建 `.fnt` + 图集 png + `fntConfig.json` 兜底 zip）
- `src/cocos3/sceneSnapshot.ts` — 快照采集
- `src/cocos3/mcpBridge.ts` — 页面 API
- `tools/mcp-cocos-inspector/index.mjs` — MCP 工具
- `tools/mcp-cocos-inspector/scene-to-creator.mjs` — Creator 重建
