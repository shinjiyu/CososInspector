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
  styles/inspector.css
```

## 开发

```bash
npm run watch
```

修改后重新加载扩展即可。

## 许可证

MIT License
