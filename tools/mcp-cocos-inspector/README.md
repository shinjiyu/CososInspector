# MCP — Cocos Inspector 3

Cursor 通过 MCP 控制试玩页上的 Inspector：**无需 Chrome 调试模式**。

## 连接方式（默认：桥接）

```text
Cursor MCP 进程
  └─ 本机 WebSocket 127.0.0.1:17373（bridge-server）
        └─ 扩展 background 主动连接
              └─ chrome.scripting → 试玩页 __cocosInspectorApi
```

1. 在 Cursor 启用 `cocos-inspector` MCP（会自动监听 `17373`）
2. **普通方式**打开 Chrome，打开 Cocos 试玩页
3. 加载 **Cocos Inspector 3** 扩展（`npm run build` 后重载扩展）

扩展后台每 2.5s 重连桥接；打开试玩页后即可用 MCP 工具。

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
