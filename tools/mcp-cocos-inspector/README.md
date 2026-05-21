# MCP — Cocos Inspector 3

通过 Chrome DevTools Protocol 连接已打开试玩页上的 **`window.__cocosInspectorApi`**，供 Cursor Agent 自动：列 Sprite、下载纹理、替换、导出替换包、重打包、截屏。

## 前置条件

1. 安装并启用 **Cocos Inspector 3** 扩展（`npm run build` 后加载 `dist/`）
2. 用远程调试端口启动 Chrome，并打开试玩页，例如：

```powershell
# Windows 示例（路径按本机 Chrome 调整）
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  "https://你的试玩页.html"
```

3. 安装 MCP 依赖：

```powershell
cd tools/mcp-cocos-inspector
npm install
```

## Cursor 配置

在 Cursor Settings → MCP 中添加（路径改成本机绝对路径）：

```json
{
  "mcpServers": {
    "cocos-inspector": {
      "command": "node",
      "args": ["D:/UGit/CososInspector/tools/mcp-cocos-inspector/index.mjs"],
      "env": {
        "COCOS_CDP_PORT": "9222",
        "COCOS_PAGE_URL_MATCH": "applovin"
      }
    }
  }
}
```

`COCOS_PAGE_URL_MATCH` 为试玩页 URL 子串，用于在多个标签中选中正确页面。

## 工具一览

| 工具 | 作用 |
|------|------|
| `cocos_list_tabs` | 查看 CDP 可见标签 |
| `cocos_page_info` | 页面 / 引擎 / 场景 |
| `cocos_list_sprites` | 扁平 Sprite 列表（筛 UI 用） |
| `cocos_get_sprite` | 单帧元数据 |
| `cocos_download_texture` | 导出 PNG 到本地 |
| `cocos_replace_texture` | base64 上传替换 |
| `cocos_revert_texture` | 还原 |
| `cocos_list_replacements` | 已记录替换对 |
| `cocos_export_replacement_pack` | 写出 manifest + images |
| `cocos_repack_super_html` | 调 `tools/repack-super-html.mjs` |
| `cocos_screenshot` | `game` / `node` / `tab` 截屏 |

## 推荐工作流（风格替换）

1. **`cocos_screenshot`** `kind=game` → 保存 `tmp/ui-ref.png`，让 Cursor 理解整体 UI
2. **`cocos_list_sprites`** → Agent 根据名称/路径判断哪些是 UI 纹理（logo、btn、symbol 等）
3. 对候选节点 **`cocos_download_texture`** → 本地 PNG
4. 用 Cursor **GenerateImage**（或其它图生图）按风格出图，保持相近分辨率
5. **`cocos_replace_texture`** 上传 base64 预览
6. 满意后 **`cocos_export_replacement_pack`** → `tmp/cocos-replacements_*`
7. **`cocos_repack_super_html`** 生成本地可试玩 HTML

## 调试

试玩页控制台应能访问：

```js
await window.__cocosInspectorApi?.listSprites()
```

若无此对象，说明扩展未注入或未 build。
