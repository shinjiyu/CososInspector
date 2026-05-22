# MCP — Cocos Inspector 3

Cursor 通过 MCP 控制试玩页上的 Inspector：**无需 Chrome 调试模式**。

## 连接方式（默认：桥接）

```text
Cursor MCP 进程
  └─ WebSocket 127.0.0.1:17373（只传 JSON / 路径）
  └─ HTTP 127.0.0.1:17374（大图 in/ out/ 落盘共享）
        └─ 扩展 background → content → 试玩页 __cocosInspectorApi
```

### 共享目录（解决「传数据」瓶颈）

| 方向 | 做法 |
|------|------|
| **上传替换** | MCP 把 PNG 写入 `tmp/mcp-share/in/`，信道只传 `in/xxx.png`；页面 `fetch` HTTP 拉图 |
| **下载纹理** | 页面仍生成像素一次；桥接写入 `out/xxx.png`，工具返回 **路径 + URL**，可选再拷到 `outPath` |

环境变量：`COCOS_MCP_SHARE_DIR`、`COCOS_SHARE_HTTP_PORT`（默认 17374）

`cocos_replace_texture` 优先用 **`imagePath`**（本地文件），避免 WebSocket 塞满 base64。

1. 项目根目录启动**常驻桥接**（保持终端不关）：

```powershell
cd D:\UGit\CososInspector
npm run cocos-bridge
```

2. 在 Cursor 启用 `cocos-inspector` MCP（作为客户端连 `17373`）
3. **普通方式**打开 Chrome，打开 Cocos 试玩页
4. 加载 **Cocos Inspector 3** 扩展（`npm run build` 后重载扩展），试玩页 **F5 刷新**

扩展连上桥接后，面板右上角 MCP 应为绿色「已连接」。

### 自动化冒烟

```powershell
npm run cocos-bridge    # 终端 1，保持运行
# Chrome 试玩页 F5，MCP 绿点
npm run build           # 改过 src 后重载扩展
npm run cocos-autotest  # 列 Sprite / 截屏 / 分片导出替换包
```

### 可选：CDP 模式（需调试端口）

仅当你坚持用远程调试时：

```powershell
$env:COCOS_USE_CDP = "1"
# Chrome 需 --remote-debugging-port=9222
```

## 安装

```powershell
cd tools/mcp-cocos-inspector
npm install
```

## Cursor 配置

```json
{
  "mcpServers": {
    "cocos-inspector": {
      "command": "node",
      "args": ["D:/UGit/CososInspector/tools/mcp-cocos-inspector/index.mjs"],
      "env": {
        "COCOS_PAGE_URL_MATCH": "applovin",
        "COCOS_BRIDGE_PORT": "17373"
      }
    }
  }
}
```

`COCOS_PAGE_URL_MATCH`：试玩页 URL 子串，用于在多个标签里选中正确页面。

## 自检

1. `cocos_list_tabs` → `extensionConnected: true`
2. 试玩页控制台：`await window.__cocosInspectorApi?.listSprites()`

若 `extensionConnected: false`：确认 Cursor 已启用 MCP、扩展已重载、试玩页为 http(s)。

## 工具与工作流

| 工具 | 作用 |
|------|------|
| `cocos_list_tabs` | 桥接是否连通 |
| `cocos_list_sprites` | 列 UI Sprite（供 Agent 筛选） |
| `cocos_screenshot` | `game` / `node` / `tab`（tab 用扩展截屏，无需 CDP） |
| `cocos_download_texture` | 导出 PNG |
| `cocos_replace_texture` | base64 替换预览 |
| `cocos_export_replacement_pack` | 写出替换包 |
| `cocos_repack_super_html` | 本机重打包 |

风格替换流程：截屏 → 列 Sprite → 下载 → GenerateImage → `cocos_replace_texture` → 导出 → 重打包。
