# Cocos Inspector

一个用于 Cocos 游戏的 Chrome 扩展，可以查看场景树结构。

## 功能

- 显示 Cocos 场景节点树
- 支持节点展开/折叠
- 支持节点选择
- 自动/手动两种刷新模式
- 实时监控场景变化

## 开发

```bash
# 安装依赖
npm install

# 开发模式构建
npm run dev

# 监听模式（自动重新构建）
npm run watch

# 生产模式构建
npm run prod
```

## 安装

1. 打开 Chrome 扩展页面 (chrome://extensions/)
2. 开启开发者模式
3. 点击"加载已解压的扩展程序"
4. 选择项目目录

## 使用方法

1. 打开任何使用 Cocos 引擎的游戏
2. 扩展会自动在页面右侧显示 inspector
3. 可以切换自动刷新/手动刷新模式
4. 点击节点可以查看详细信息

## 许可

ISC
