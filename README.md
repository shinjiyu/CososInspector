# Cocos Inspector 3

面向 **Cocos Creator 3.x** 的 Chrome 扩展，在浏览器中运行游戏时以只读方式查看场景节点树。

> 仅支持 3.x，不兼容 Cocos 2.4。不提供属性编辑、钩子、动画图等能力。

## 功能

- 检测 `window.cc`（`ENGINE_VERSION` 以 `3` 开头）
- 展示 `cc.director.getScene()` 下的完整节点层级
- 展开 / 折叠子节点
- 按名称搜索并自动展开匹配分支
- 选中节点高亮（仅面板内，不修改游戏对象）
- 自动刷新（500ms）与手动刷新
- Sprite 预览、下载 PNG、运行时上传替换
- **替换包**：记录「原贴图线索 → 新图」，导出后在下载的试玩页源码中批量替换资源文件

### 试玩广告换皮流程（推荐：Web 重打包）

1. Chrome 扩展：试玩页换皮 → **替换包** 导出 zip（或把导出的文件打成 zip，含 `manifest.json`）
2. 启动 Web 服务并上传（**zip + 原版试玩 html 文件或 URL**，无默认模板）：

```bash
cd tools/repack-web && npm install && npm start
# 本地 http://127.0.0.1:8787
# 线上 https://kuroneko.chat/cocos-repack/
# 上传：替换包 zip + 试玩 .html（或试玩页 URL）
```

3. 解压后 `npx serve .` 预览试玩 HTML

详见 [tools/repack-web/README.md](tools/repack-web/README.md)。

### 可选：本地桥接 / MCP

`npm run cocos-bridge` + 扩展「导出并打包」适合 Cursor 自动化；日常手工换皮用 **repack-web** 更简单。

手动命令（与自动等价）：

```bash
node tools/repack-super-html.mjs --html tools/_probe/applovin2103.html --pack tmp/mcp-share/out/cocos-replacements_<时间> --out tmp/mcp-share/out/cocos-replacements_<时间>/repacked_applovin2103.html
```

重打包默认会把 `cc` 的 import map 改成 `about:cocos-js/cc.js`，便于 `npx serve` 单目录预览；部署到含 `../cocos-js/` 的线上目录时加 `--keep-import-map`。

**图集子帧**：manifest 里带有 `original.frameRect`（且区域小于整张 native 图集）时，会把替换图合成进对应 PNG 图集，而不是覆盖整张纹理；仍会自动处理 oasj 第 27 位占位与 data URL 长度上限。

4. 备选：`node tools/apply-replacements.mjs`（已下载的整站目录 + 替换包）

## 构建与安装

```bash
npm install
npm run build
```

1. 打开 `chrome://extensions/`
2. 开启开发者模式
3. 加载已解压的扩展 → 选择项目根目录

## 项目结构

```
src/
  content.ts          # 注入 CSS / injected.js
  injected.ts         # 主逻辑入口
  cocos3/
    detect.ts         # 3.x 环境检测
    sceneTree.ts      # 场景树遍历与哈希
    replacementStore.ts / replacementExport.ts / replacementPanel.ts
  tools/apply-replacements.mjs
  styles/inspector.css
```

## 开发

```bash
npm run watch
```

修改后重新加载扩展即可。

## 许可证

MIT License
