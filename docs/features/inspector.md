# 检查器功能文档

## 功能概述

检查器功能允许用户查看和修改 Cocos 游戏场景中选中节点的详细属性和组件信息。该功能提供了丰富的属性编辑器和实时预览能力，帮助开发者快速调试和修改游戏对象。

## 主要功能

### 1. 节点基本属性显示与编辑

- **名称编辑**: 支持查看和修改节点名称
- **位置属性**: 支持查看和修改节点的位置坐标 (x, y, z)
- **旋转属性**: 支持查看和修改节点的旋转值 (x, y, z, w)
- **缩放属性**: 支持查看和修改节点的缩放值 (x, y, z)
- **锚点属性**: 支持查看和修改节点的锚点坐标
- **大小属性**: 支持查看和修改节点的宽高
- **颜色属性**: 支持查看和修改节点的颜色值
- **不透明度**: 支持查看和修改节点的不透明度
- **激活状态**: 支持切换节点的激活/非激活状态

### 2. 组件列表显示

- **组件类型识别**: 自动识别节点上的所有组件类型
- **组件分组显示**: 按类别分组展示组件
- **组件展开/折叠**: 支持展开或折叠组件详情
- **组件启用控制**: 支持启用/禁用组件

### 3. 组件属性编辑

- **基础类型属性**: 支持编辑数字、字符串、布尔值等基础类型
- **向量类型属性**: 支持编辑 Vec2、Vec3、Vec4 类型
- **颜色类型属性**: 支持颜色选择器编辑颜色属性
- **引用类型属性**: 支持查看引用类型属性（如纹理、预制体等）
- **枚举类型属性**: 支持下拉选择枚举类型属性
- **数组类型属性**: 支持查看数组类型属性

### 4. 实时预览

- **属性修改实时反馈**: 修改属性后游戏场景立即更新
- **视觉边界框**: 显示选中节点的边界框
- **节点高亮**: 在游戏视图中高亮显示选中的节点

### 5. 属性监控

- **设置属性钩子**: 支持设置读取/写入属性钩子，用于调试
- **监控状态指示**: 显示属性的监控状态
- **属性变化日志**: 记录被监控属性的变化

## 技术实现

### 组件渲染系统

检查器使用了组件渲染器系统来处理不同类型组件的显示：

```typescript
export class RendererManager {
  private renderers: ComponentRenderer[] = [];

  constructor() {
    // 注册内置渲染器
    this.registerRenderer(new TransformRenderer());
    this.registerRenderer(new DefaultRenderer());
  }

  /**
   * 注册组件渲染器
   * @param renderer 要注册的渲染器
   */
  public registerRenderer(renderer: ComponentRenderer): void {
    this.renderers.push(renderer);
  }

  /**
   * 获取适合渲染指定组件的渲染器
   * @param component 要渲染的组件
   */
  public getRenderer(component: cc.Component): ComponentRenderer {
    // 查找第一个能够渲染该组件的渲染器
    const renderer = this.renderers.find((r) => r.canRender(component));
    return renderer || this.getDefaultRenderer();
  }

  /**
   * 获取默认渲染器
   */
  private getDefaultRenderer(): ComponentRenderer {
    return this.renderers[this.renderers.length - 1];
  }

  /**
   * 渲染组件
   * @param component 要渲染的组件
   */
  public renderComponent(component: cc.Component): string {
    const renderer = this.getRenderer(component);
    return renderer.render(component);
  }
}
```

### 属性编辑器实现

属性编辑器根据不同类型提供不同的编辑界面：

```typescript
private renderProperty(prop: string, value: any, component: cc.Component): string {
  const type = this.getPropertyType(value);
  let html = '';

  switch (type) {
    case 'number':
      html = `<input type="number" class="property-input" data-prop="${prop}" value="${value}" step="0.1">`;
      break;
    case 'boolean':
      html = `<input type="checkbox" class="property-checkbox" data-prop="${prop}" ${value ? 'checked' : ''}>`;
      break;
    case 'string':
      html = `<input type="text" class="property-input" data-prop="${prop}" value="${value || ''}">`;
      break;
    case 'vector2':
      html = this.renderVectorProperty(prop, value, 2);
      break;
    case 'vector3':
      html = this.renderVectorProperty(prop, value, 3);
      break;
    case 'color':
      html = this.renderColorProperty(prop, value);
      break;
    // 更多类型...
    default:
      html = `<span class="property-readonly">${JSON.stringify(value)}</span>`;
  }

  return `
    <div class="property-row">
      <div class="property-name">${prop}</div>
      <div class="property-value">${html}</div>
    </div>
  `;
}
```

### 属性更新机制

属性更新采用增量更新机制，只重新渲染变化的组件：

```typescript
private updateDetailsIncremental(components: cc.Component[]): void {
  // 检查组件列表是否变化
  const currentComponents = components.map(c => c.uuid).join(',');
  const oldComponentIds = this.lastRenderedComponents || '';

  if (currentComponents !== oldComponentIds) {
    // 组件列表发生变化，完全重新渲染
    console.log(`[增量更新:详情] 组件列表变化 (${oldComponentIds}) -> (${currentComponents})`);
    this.updateDetails();
    return;
  }

  // 组件列表未变化，检查各组件是否有变化
  let hasChanges = false;

  components.forEach(component => {
    const hash = this.generateComponentHash(component);
    const oldHash = this.componentHashes.get(component.uuid);

    if (hash !== oldHash) {
      hasChanges = true;
      this.componentHashes.set(component.uuid, hash);

      // 找到对应的组件元素进行更新
      const componentElement = this.detailsContainer?.querySelector(`[data-component-id="${component.uuid}"]`);
      if (componentElement) {
        const newHtml = this.rendererManager.renderComponent(component);
        componentElement.outerHTML = newHtml;
        console.log(`[增量更新:组件] ${component.constructor.name}(${component.uuid}) - 更新完成`);
      }
    }
  });

  if (!hasChanges) {
    console.log('[增量更新:详情] 无变化，跳过更新');
  }
}
```

## 用户交互处理

检查器支持以下用户交互操作：

1. **属性编辑**: 通过输入框、复选框等控件编辑属性
2. **组件展开/折叠**: 点击组件标题展开或折叠组件详情
3. **属性钩子设置**: 点击属性行旁的钩子按钮设置属性钩子

## 配置选项

检查器功能提供以下配置选项：

| 配置项       | 默认值 | 说明               |
| ------------ | ------ | ------------------ |
| 数值精度     | 2      | 显示数值的小数位数 |
| 自动展开组件 | 是     | 是否默认展开组件   |
| 属性排序方式 | 按名称 | 属性的排序方式     |

## 性能优化

为了确保检查器在组件和属性较多时保持良好的性能，实现了以下优化：

1. **增量更新**: 只更新发生变化的组件，减少 DOM 操作
2. **延迟渲染**: 大型组件列表采用延迟渲染机制
3. **属性缓存**: 缓存属性值计算结果，避免重复计算
4. **组件缓存**: 缓存组件渲染结果，提高重复渲染性能

## 已知问题和限制

1. 不支持编辑复杂的引用类型属性
2. 自定义组件的某些属性可能无法正确识别和编辑
3. 深层嵌套的对象属性编辑支持有限
4. 数组类型属性目前仅支持查看，不支持编辑

## 未来计划

1. 增强对复杂类型属性的编辑支持
2. 添加拖拽功能，支持节点间的引用拖拽
3. 支持自定义编辑器插件系统
4. 添加撤销/重做功能
