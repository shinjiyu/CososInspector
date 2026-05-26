# Cocos 试玩换皮 · Web 重打包

上传 **替换包 zip** + **原版试玩 HTML**（文件或 URL），服务端执行 `repack-super-html`，返回可下载试玩页。

**不使用任何内置默认 HTML**；必须与换皮时同一套试玩。

## 启动

```powershell
cd tools/repack-web
npm install
npm start
```

浏览器：**http://127.0.0.1:8787**

## 必填项

| 项 | 说明 |
|----|------|
| `pack` | 扩展导出的 `cocos-replacements_*.zip` |
| 试玩 HTML | **上传 `.html`** 或表单字段 **`htmlUrl`**（`http`/`https`） |

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `REPACK_WEB_PORT` | `8787` | 端口 |
| `REPACK_WEB_MAX_MB` | `80` | 替换包 zip 上限 |
| `REPACK_WEB_HTML_MAX_MB` | `50` | URL 拉取的 html 上限 |
| `REPACK_WEB_HTML_FETCH_MS` | `60000` | URL 拉取超时 |

## API

`POST /api/repack` — `multipart/form-data`

| 字段 | 必填 | 说明 |
|------|------|------|
| `pack` | 是 | 替换包 `.zip` |
| `html` | * | 原版试玩 `.html` 文件 |
| `htmlUrl` | * | 试玩页 URL（与 `html` 二选一，必填其一） |

`GET /api/health` — 服务状态
