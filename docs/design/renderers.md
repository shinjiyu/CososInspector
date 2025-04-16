# 渲染器设计文档

## 设计概述

渲染器系统是 Cocos Inspector 的核心设计之一，它负责将 Cocos 引擎的组件数据转换为可视化的 HTML 界面。渲染器系统采用了可扩展的插件式架构，允许为不同类型的组件提供专门的渲染逻辑，同时保持统一的渲染管理机制。本文档详细描述了渲染器系统的设计原则、实现细节和扩展方法。

## 系统设计

### 设计目标

1. **可扩展性**: 支持为不同类型的组件添加专门的渲染器
2. **一致性**: 提供统一的渲染接口和管理机制
3. **易用性**: 为开发者提供简单直观的渲染器扩展方式
4. **高效性**: 确保渲染过程高效，减少不必要的 DOM 操作
5. **分离关注点**: 将组件的数据和视图表现分离

### 核心组件

渲染器系统包含以下核心组件：

1. **渲染器接口 (ComponentRenderer)**: 定义所有渲染器必须实现的通用接口
2. **渲染器管理器 (RendererManager)**: 管理所有注册的渲染器，并将组件路由到合适的渲染器
3. **默认渲染器 (DefaultRenderer)**: 处理通用组件的渲染
4. **专用渲染器**: 为特定类型的组件提供定制化的渲染逻辑，如 TransformRenderer

## 接口定义

### ComponentRenderer 接口

```typescript
// 组件渲染器接口
export interface ComponentRenderer {
  // 判断是否可以渲染指定组件
  canRender(component: cc.Component): boolean;

  // 渲染组件并返回HTML
  render(component: cc.Component): string;
}
```

此接口定义了所有渲染器必须实现的两个核心方法：

1. **canRender**: 决定渲染器是否能够处理特定类型的组件
2. **render**: 将组件数据转换为 HTML 字符串

## 渲染器管理器

渲染器管理器是整个渲染系统的中枢，负责管理所有渲染器并将组件分发给适当的渲染器处理。

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

渲染器管理器的主要职责包括：

1. **渲染器注册**: 通过 `registerRenderer` 方法注册新的渲染器
2. **渲染器选择**: 通过 `getRenderer` 方法为特定组件选择合适的渲染器
3. **组件渲染**: 通过 `renderComponent` 方法渲染组件

### 渲染器查找算法

渲染器的查找遵循"最先匹配"原则：

1. 按照注册顺序检查每个渲染器
2. 调用每个渲染器的 `canRender` 方法检查是否能处理组件
3. 返回第一个返回 `true` 的渲染器
4. 如果没有找到合适的渲染器，则使用默认渲染器

这种设计允许专用渲染器优先处理特定组件，而默认渲染器作为兜底方案处理通用情况。

## 内置渲染器

### 默认渲染器 (DefaultRenderer)

默认渲染器是一个通用的组件渲染器，能够处理任何 Cocos 组件：

```typescript
export class DefaultRenderer implements ComponentRenderer {
  canRender(component: cc.Component): boolean {
    // 默认渲染器可以渲染任何组件
    return true;
  }

  render(component: cc.Component): string {
    const componentName = component.constructor.name || "Component";

    // 收集所有公开属性
    const properties = this.getComponentProperties(component);

    // 构建属性行
    let propertiesHTML = "";
    if (properties.length > 0) {
      properties.forEach((prop) => {
        const value = (component as any)[prop];
        propertiesHTML += this.renderProperty(prop, value);
      });
    } else {
      propertiesHTML = '<div class="no-properties">没有可显示的属性</div>';
    }

    // 构建组件HTML
    return `
      <div class="component-item" data-component-id="${component.uuid}">
        <div class="component-header">
          <div class="component-name">${componentName}</div>
          <div class="component-toggle">▼</div>
        </div>
        <div class="component-content">
          ${propertiesHTML}
        </div>
      </div>
    `;
  }

  private getComponentProperties(component: cc.Component): string[] {
    const properties: string[] = [];

    // 获取组件所有属性
    for (const key in component) {
      // 排除私有属性、函数和系统属性
      if (
        key.startsWith("_") ||
        typeof (component as any)[key] === "function" ||
        this.isSystemProperty(key)
      ) {
        continue;
      }

      properties.push(key);
    }

    return properties;
  }

  private renderProperty(prop: string, value: any): string {
    const type = this.getPropertyType(value);
    let html = "";

    switch (type) {
      case "number":
        html = `<input type="number" class="property-input" data-prop="${prop}" value="${value}" step="0.1">`;
        break;
      case "boolean":
        html = `<input type="checkbox" class="property-checkbox" data-prop="${prop}" ${
          value ? "checked" : ""
        }>`;
        break;
      case "string":
        html = `<input type="text" class="property-input" data-prop="${prop}" value="${
          value || ""
        }">`;
        break;
      // 更多类型处理...
      default:
        html = `<span class="property-readonly">${JSON.stringify(
          value
        )}</span>`;
    }

    return `
      <div class="property-row">
        <div class="property-name">${prop}</div>
        <div class="property-value">${html}</div>
      </div>
    `;
  }

  // 其他辅助方法...
}
```

默认渲染器的主要功能包括：

1. **属性发现**: 自动发现组件的公开属性
2. **类型推断**: 分析属性类型并选择合适的编辑控件
3. **属性渲染**: 为不同类型的属性生成合适的 HTML 控件
4. **组件布局**: 提供统一的组件布局结构

### 变换渲染器 (TransformRenderer)

变换渲染器是一个专用渲染器，专门用于渲染 Cocos 引擎的 Transform 组件：

```typescript
export class TransformRenderer implements ComponentRenderer {
  canRender(component: cc.Component): boolean {
    // 检查是否是Transform组件
    return (
      component instanceof cc.Node || component.constructor.name === "Transform"
    );
  }

  render(component: cc.Component): string {
    // 获取节点对象 (可能是节点本身或节点的Transform组件)
    const node =
      component instanceof cc.Node ? component : (component as any).node;

    if (!node) {
      return '<div class="error">无法获取节点信息</div>';
    }

    // 构建位置编辑器
    const position = node.position;
    const positionHTML = `
      <div class="vector-property">
        <div class="vector-label">X</div>
        <input type="number" class="vector-input" data-prop="position.x" value="${position.x.toFixed(
          2
        )}" step="1">
        <div class="vector-label">Y</div>
        <input type="number" class="vector-input" data-prop="position.y" value="${position.y.toFixed(
          2
        )}" step="1">
        <div class="vector-label">Z</div>
        <input type="number" class="vector-input" data-prop="position.z" value="${position.z.toFixed(
          2
        )}" step="1">
      </div>
    `;

    // 构建旋转角度编辑器
    const rotation = node.rotation;
    const rotationHTML = `
      <div class="vector-property">
        <div class="vector-label">X</div>
        <input type="number" class="vector-input" data-prop="rotation.x" value="${rotation.x.toFixed(
          2
        )}" step="1">
        <div class="vector-label">Y</div>
        <input type="number" class="vector-input" data-prop="rotation.y" value="${rotation.y.toFixed(
          2
        )}" step="1">
        <div class="vector-label">Z</div>
        <input type="number" class="vector-input" data-prop="rotation.z" value="${rotation.z.toFixed(
          2
        )}" step="1">
      </div>
    `;

    // 构建缩放编辑器
    const scale = node.scale;
    const scaleHTML = `
      <div class="vector-property">
        <div class="vector-label">X</div>
        <input type="number" class="vector-input" data-prop="scale.x" value="${scale.x.toFixed(
          2
        )}" step="0.1">
        <div class="vector-label">Y</div>
        <input type="number" class="vector-input" data-prop="scale.y" value="${scale.y.toFixed(
          2
        )}" step="0.1">
        <div class="vector-label">Z</div>
        <input type="number" class="vector-input" data-prop="scale.z" value="${scale.z.toFixed(
          2
        )}" step="0.1">
      </div>
    `;

    // 组合所有属性
    return `
      <div class="component-item transform-component" data-component-id="transform">
        <div class="component-header">
          <div class="component-name">Transform</div>
          <div class="component-toggle">▼</div>
        </div>
        <div class="component-content">
          <div class="property-row">
            <div class="property-name">Position</div>
            <div class="property-value">${positionHTML}</div>
          </div>
          <div class="property-row">
            <div class="property-name">Rotation</div>
            <div class="property-value">${rotationHTML}</div>
          </div>
          <div class="property-row">
            <div class="property-name">Scale</div>
            <div class="property-value">${scaleHTML}</div>
          </div>
        </div>
      </div>
    `;
  }
}
```

变换渲染器的特点包括：

1. **专用布局**: 为变换组件提供专门的布局和控件
2. **向量编辑**: 支持三维向量的可视化编辑
3. **精确控制**: 提供步进值和格式化输出
4. **统一交互**: 与其他渲染器保持一致的用户交互模式

## 渲染数据流

渲染器系统中的数据流遵循以下流程：

1. **组件选择**: 用户在节点树中选择一个节点
2. **组件获取**: 系统获取节点上的所有组件
3. **渲染器分发**: 渲染器管理器为每个组件选择合适的渲染器
4. **组件渲染**: 每个渲染器将组件数据转换为 HTML
5. **DOM 更新**: 生成的 HTML 被插入到 DOM 中
6. **事件绑定**: 为渲染的控件绑定交互事件
7. **用户交互**: 用户与渲染的界面交互，修改属性
8. **属性更新**: 用户修改的属性被应用到 Cocos 组件上

## 增量更新

为提高性能，渲染器系统实现了增量更新机制：

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

private generateComponentHash(component: cc.Component): string {
  try {
    const props: Record<string, any> = {};

    // 收集组件所有公开属性
    for (const key in component) {
      if (key.startsWith('_') || typeof (component as any)[key] === 'function') {
        continue;
      }

      try {
        const value = (component as any)[key];
        props[key] = value;
      } catch (e) {
        // 忽略访问错误
      }
    }

    // 生成哈希
    return JSON.stringify(props);
  } catch (e) {
    return component.uuid || String(Math.random());
  }
}
```

增量更新的主要特点：

1. **组件列表比对**: 检查组件列表是否发生变化
2. **组件状态哈希**: 为每个组件生成状态哈希值
3. **差异检测**: 比较哈希值检测组件变化
4. **局部更新**: 只更新发生变化的组件
5. **性能优化**: 减少不必要的 DOM 操作

## 事件处理

渲染器生成的 UI 元素需要处理用户交互，实现属性修改：

```typescript
private setupEventListeners(): void {
  // 确保详情容器存在
  if (!this.detailsContainer) return;

  // 使用事件委托模式为所有属性输入添加事件监听
  this.detailsContainer.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;

    // 处理input元素的变化
    if (target.tagName === 'INPUT' && target.dataset.prop) {
      this.handlePropertyChange(target);
    }
  });

  // 组件折叠/展开
  this.detailsContainer.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // 处理组件标题点击
    if (target.classList.contains('component-header') || target.classList.contains('component-toggle')) {
      const componentItem = target.closest('.component-item');
      if (componentItem) {
        componentItem.classList.toggle('collapsed');

        // 记住组件的展开状态
        const componentId = componentItem.dataset.componentId;
        if (componentId) {
          if (componentItem.classList.contains('collapsed')) {
            this.expandedComponents.delete(componentId);
          } else {
            this.expandedComponents.add(componentId);
          }
        }
      }
    }
  });
}

private handlePropertyChange(inputElement: HTMLElement): void {
  // 确保选中了节点
  if (!this.selectedNode) return;

  // 获取属性路径和新值
  const propPath = inputElement.dataset.prop;
  if (!propPath) return;

  let newValue: any;

  // 根据输入类型获取值
  if (inputElement.tagName === 'INPUT') {
    const input = inputElement as HTMLInputElement;

    if (input.type === 'checkbox') {
      newValue = input.checked;
    } else if (input.type === 'number') {
      newValue = parseFloat(input.value);
    } else {
      newValue = input.value;
    }
  }

  // 更新节点属性
  this.updateNodeProperty(this.selectedNode, propPath, newValue);
}
```

事件处理的主要功能包括：

1. **事件委托**: 使用事件委托模式减少事件监听器数量
2. **属性变更**: 监听输入控件的变化并更新属性
3. **组件折叠**: 处理组件的展开/折叠状态
4. **状态记忆**: 记住用户设置的界面状态

## 扩展渲染器

### 创建自定义渲染器

要创建自定义渲染器，需要实现 `ComponentRenderer` 接口：

```typescript
export class CustomComponentRenderer implements ComponentRenderer {
  canRender(component: cc.Component): boolean {
    // 判断是否可以渲染特定组件
    return component.constructor.name === "CustomComponent";
  }

  render(component: cc.Component): string {
    // 将组件渲染为HTML
    const customComponent = component as CustomComponent;

    // 构建自定义HTML
    return `
      <div class="component-item custom-component" data-component-id="${component.uuid}">
        <div class="component-header">
          <div class="component-name">Custom Component</div>
          <div class="component-toggle">▼</div>
        </div>
        <div class="component-content">
          <!-- 自定义属性渲染 -->
        </div>
      </div>
    `;
  }
}
```

### 注册自定义渲染器

创建渲染器后，需要将其注册到渲染器管理器中：

```typescript
// 获取渲染器管理器实例
const rendererManager = new RendererManager();

// 注册自定义渲染器
rendererManager.registerRenderer(new CustomComponentRenderer());
```

注册顺序很重要，因为渲染器查找遵循"最先匹配"原则。

## 最佳实践

### 渲染器设计原则

1. **单一职责**: 每个渲染器只负责一种类型的组件
2. **明确边界**: 在 `canRender` 方法中明确定义渲染器的适用范围
3. **一致性**: 保持与其他渲染器一致的 UI 风格和交互模式
4. **错误处理**: 妥善处理组件数据缺失或异常情况
5. **性能优化**: 减少不必要的 DOM 操作和计算

### 性能优化技巧

1. **延迟初始化**: 只在需要时初始化渲染器
2. **缓存结果**: 缓存重复使用的渲染结果
3. **批量操作**: 收集变更后一次性更新 DOM
4. **最小化渲染**: 只渲染发生变化的部分
5. **事件委托**: 使用事件委托减少事件监听器数量

## 未来计划

1. **虚拟 DOM**: 使用虚拟 DOM 技术优化渲染性能
2. **组件模板**: 支持使用模板引擎定义组件渲染
3. **自定义编辑器**: 允许为复杂属性提供定制化编辑器
4. **拖拽支持**: 增强组件界面的交互性
5. **主题定制**: 支持自定义渲染主题
