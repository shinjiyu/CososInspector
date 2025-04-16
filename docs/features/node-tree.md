# 节点树功能文档

## 功能概述

节点树功能是 Cocos Inspector 的核心功能之一，它允许用户查看和操作 Cocos 游戏场景中的节点树结构。通过这个功能，用户可以直观地了解场景的构成，选择特定节点进行检查和修改。

## 主要功能

### 1. 节点树结构显示

- **场景根节点显示**: 显示当前场景的根节点
- **子节点层级关系**: 以树形结构展示节点的层级关系
- **节点基本信息**: 显示节点名称、激活状态等基本信息
- **节点类型标识**: 通过图标区分不同类型的节点

### 2. 节点展开与折叠

- **交互式展开/折叠**: 点击箭头图标展开或折叠子节点
- **记忆展开状态**: 刷新时保持节点的展开状态
- **批量展开/折叠**: 支持展开/折叠特定层级的所有节点

### 3. 节点选择

- **单击选择**: 单击节点可选中该节点
- **高亮显示**: 被选中的节点在树中高亮显示
- **视觉反馈**: 选中节点时在游戏视图中显示节点边界框

### 4. 节点搜索

- **节点名称搜索**: 根据节点名称进行搜索
- **实时过滤**: 在输入搜索内容时实时过滤节点树
- **搜索结果高亮**: 高亮显示匹配的搜索结果

### 5. 节点状态指示

- **激活状态指示**: 显示节点的激活/非激活状态
- **可见性指示**: 显示节点的可见/隐藏状态
- **组件数量指示**: 显示节点拥有的组件数量

## 技术实现

### 节点树生成

```typescript
private generateNodeTree(scene: cc.Node): string {
  // 生成节点树HTML结构
  let html = '<div class="node-tree">';

  // 递归生成节点项
  const buildNodeTree = (node: cc.Node, depth: number = 0): void => {
    const nodeItem = this.generateNodeItem(node);
    html += nodeItem;

    // 处理子节点
    if (node.children && node.children.length > 0) {
      const isExpanded = this.expandedNodes.has(node.uuid);
      html += `<div class="node-children ${isExpanded ? 'expanded' : 'collapsed'}" data-parent="${node.uuid}">`;

      // 按照名称排序子节点
      const sortedChildren = [...node.children].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );

      sortedChildren.forEach(child => buildNodeTree(child, depth + 1));
      html += '</div>';
    }
  };

  // 从场景根节点开始构建树
  buildNodeTree(scene);
  html += '</div>';

  return html;
}
```

### 增量更新机制

为了提高性能，节点树采用了增量更新机制，只更新发生变化的部分：

```typescript
private updateNodeTreeIncremental(scene: cc.Node): void {
  try {
    // 检查场景结构是否发生变化
    if (!this.hasSceneStructureChanged(scene)) {
      console.log('[增量更新:树] 场景结构未变化，跳过更新');
      return;
    }

    // 生成节点哈希值并进行比对
    // 只更新发生变化的节点分支
    // ...
  } catch (error) {
    console.error('[增量更新:树] 更新失败:', error);
    // 回退到完全刷新
    this.forceRefreshTree();
  }
}
```

## 用户交互处理

节点树支持以下用户交互操作：

1. **点击节点**: 选中节点，显示其详细信息
2. **点击展开/折叠图标**: 展开或折叠子节点
3. **右键节点**: 显示上下文菜单（开发中）

## 配置选项

节点树功能提供以下配置选项：

| 配置项         | 默认值 | 说明                     |
| -------------- | ------ | ------------------------ |
| 自动展开层级   | 2      | 初始化时自动展开的层级数 |
| 节点排序方式   | 按名称 | 子节点的排序方式         |
| 显示非激活节点 | 是     | 是否显示非激活状态的节点 |

## 性能优化

为了确保在节点数量较多时保持良好的性能，节点树功能实现了以下优化措施：

1. **增量更新**: 只更新发生变化的节点，减少 DOM 操作
2. **延迟加载**: 大型节点树采用延迟加载机制
3. **虚拟滚动**: 只渲染可视区域内的节点（计划中）
4. **更新节流**: 控制更新频率，避免频繁更新

## 已知问题和限制

1. 当场景节点超过 5000 个时，可能出现性能下降
2. 特殊的节点名称（包含 HTML 特殊字符）可能导致显示问题
3. 极深层级的节点树（超过 20 层）可能影响用户体验

## 未来计划

1. 添加节点搜索功能
2. 实现节点拖拽重排功能
3. 支持自定义节点过滤器
4. 添加节点路径复制功能
