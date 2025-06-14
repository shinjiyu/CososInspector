# Cocos Inspector

一个用于 Cocos Creator 游戏引擎的开发者工具，提供实时的场景树查看和动画状态图可视化功能。

## 功能特性

### 场景树查看器

- 实时显示 Cocos Creator 场景中的节点层次结构
- 支持节点属性的实时编辑和修改
- 提供节点的详细信息查看
- 支持节点的可视化高亮显示
- 增量更新机制，提供流畅的用户体验

### 动画状态图 (新功能)

- **可视化动画关系**: 使用图形化界面展示动画之间的串行、并行和依赖关系
- **实时状态监控**: 实时显示动画的执行状态（等待、运行、完成、暂停、错误）
- **进度跟踪**: 可视化显示每个动画的执行进度
- **交互式控制**: 支持动画的播放、暂停、停止和重置操作
- **多种布局算法**: 支持 Dagre、广度优先、圆形、同心圆、网格等多种图布局
- **数据导入导出**: 支持动画图数据的保存和加载
- **图片导出**: 支持将动画状态图导出为 PNG 图片

## 安装和使用

### 安装依赖

```bash
npm install
```

### 构建项目

```bash
npm run build
```

### 在浏览器中加载扩展

1. 打开 Chrome 浏览器
2. 进入扩展管理页面 (chrome://extensions/)
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目的根目录

## 动画状态图使用指南

### 基本概念

#### 动画节点类型

- **单个动画 (Single)**: 基础的单个动画，如淡入、移动、缩放等
- **序列动画 (Sequence)**: 按顺序执行的动画组合
- **并行动画 (Parallel)**: 同时执行的动画组合

#### 动画连接类型

- **顺序执行 (Sequence)**: 前一个动画完成后执行下一个动画
- **触发关系 (Trigger)**: 基于条件或事件触发的动画关系
- **依赖关系 (Dependency)**: 动画之间的依赖关系

#### 动画状态

- **等待中 (Pending)**: 动画尚未开始
- **运行中 (Running)**: 动画正在执行
- **已完成 (Completed)**: 动画执行完成
- **已暂停 (Paused)**: 动画被暂停
- **错误 (Error)**: 动画执行出错

### 界面操作

#### 工具栏功能

- **加载**: 从 JSON 文件加载动画图数据
- **保存**: 将当前动画图保存为 JSON 文件
- **清空**: 清空当前动画图
- **演示**: 加载演示数据并播放示例动画
- **适应**: 调整视图以适应所有节点
- **居中**: 将视图居中显示
- **重置缩放**: 重置视图缩放级别
- **布局选择**: 选择不同的图布局算法
- **导出图片**: 将动画状态图导出为 PNG 图片

#### 详情面板

- 显示选中动画节点或连接的详细信息
- 包括动画参数、执行时间、进度等信息
- 支持实时更新显示

#### 控制面板

- 提供动画播放控制按钮
- 显示整体动画进度
- 支持全局动画控制操作

### 编程接口

#### 事件系统

动画状态图通过自定义事件与外部代码通信：

```javascript
// 发送动画事件
window.dispatchEvent(
  new CustomEvent("cocosAnimationEvent", {
    detail: {
      type: "start", // 事件类型: start, progress, complete, pause, resume, error
      animationId: "anim-1", // 动画ID
      timestamp: Date.now(), // 时间戳
      data: {
        // 可选的事件数据
        progress: 0.5, // 进度值 (0-1)
        error: "error message", // 错误信息
      },
    },
  })
);
```

#### 动画数据结构

```javascript
// 动画节点
const animationNode = {
  id: "anim-1", // 唯一标识符
  name: "淡入动画", // 动画名称
  type: "single", // 动画类型: single, sequence, parallel
  duration: 1000, // 持续时间（毫秒）
  status: "pending", // 状态: pending, running, completed, paused, error
  progress: 0, // 进度 (0-1)
  params: {
    // 动画参数
    opacity: { from: 0, to: 1 },
  },
  targetNodeId: "node-1", // 目标节点ID
};

// 动画连接
const animationEdge = {
  id: "edge-1", // 唯一标识符
  source: "anim-1", // 源动画ID
  target: "anim-2", // 目标动画ID
  type: "sequence", // 连接类型: sequence, trigger, dependency
  delay: 0, // 延迟时间（毫秒）
  condition: "progress > 0.5", // 条件表达式
};
```

### 演示功能

点击工具栏中的"演示"按钮可以：

1. 加载包含多种动画类型和关系的示例数据
2. 自动播放动画序列，展示状态变化
3. 演示不同布局算法的效果
4. 展示实时进度更新和状态监控

### 最佳实践

1. **合理组织动画结构**: 使用序列和并行动画组合来组织复杂的动画逻辑
2. **设置有意义的动画名称**: 便于在图中识别和管理
3. **使用适当的布局算法**: 根据动画关系的复杂程度选择合适的布局
4. **监控动画性能**: 通过状态图观察动画执行情况，优化性能
5. **保存重要配置**: 将复杂的动画图配置保存为文件，便于复用

## 开发规范

- 使用 2 个空格缩进
- 每行不超过 100 个字符
- 使用单引号代替双引号
- 优先使用箭头函数
- 所有日志必须包含节点名称和 UUID
- 使用中文进行注释和文档编写

## 技术架构

### 核心组件

- **AnimationGraphManager**: 动画数据管理和事件处理
- **AnimationGraphRenderer**: 基于 Cytoscape.js 的图形渲染
- **AnimationGraphUI**: 完整的用户界面组件

### 依赖库

- **Cytoscape.js**: 图形可视化库
- **TypeScript**: 类型安全的 JavaScript
- **Webpack**: 模块打包工具

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证

MIT License
