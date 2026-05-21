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

### 试玩广告换皮流程（如 AppLovin / super-html）

1. 打开试玩页（例如 `applovin2103.html`），在 **Sprite** 树中选中节点并 **上传替换**（仅当前会话预览）
2. 打开 **替换包** Tab → **导出替换包**（`manifest.json`、`images/`、`page-resources.json`）
3. **super-html 重打包**（推荐）：

```bash
# 将 tmp 内 manifest + 扁平图片放在同一目录，或标准 images/ 子目录
node tools/repack-super-html.mjs --html path/to/applovin2103.html --pack tmp --out tmp/repacked.html
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
