# 钩子功能文档

## 功能概述

钩子功能是 Cocos Inspector 的高级调试功能，允许用户监听和拦截 Cocos 对象属性的读取和修改操作。通过此功能，开发者可以深入了解游戏运行时属性的变化情况，追踪属性的访问来源，以及监控属性值的变更过程。

## 主要功能

### 1. 属性读取钩子

- **监听属性读取**: 监听对指定属性的读取操作
- **断点调试**: 在属性被读取时自动触发调试器断点
- **读取日志**: 记录属性读取的时间、来源和值
- **读取计数**: 统计属性被读取的次数

### 2. 属性写入钩子

- **监听属性修改**: 监听对指定属性的修改操作
- **断点调试**: 在属性被修改时自动触发调试器断点
- **修改日志**: 记录属性修改前后的值和修改时间
- **修改拦截**: 可选择性地拦截或修改属性的设置值

### 3. 钩子管理

- **添加/移除钩子**: 通过 UI 界面添加或移除属性钩子
- **钩子状态指示**: 在 UI 中显示属性的钩子状态
- **批量管理**: 支持批量添加或移除钩子
- **持久化设置**: 记住用户设置的钩子配置

### 4. 数组元素钩子

- **数组元素监听**: 支持监听数组特定索引位置的元素
- **向量组件监听**: 支持监听向量(如 Vec3)的特定分量

### 5. 特殊属性钩子

- **Transform 属性**: 预设的 transform 相关属性钩子
- **节点状态属性**: 预设的节点状态相关属性钩子
- **组件属性**: 支持特定组件上的属性钩子

## 技术实现

### 钩子管理器

钩子管理器负责统一管理所有的属性钩子：

```typescript
export class HookManager {
  private static instance: HookManager;

  /**
   * 存储已hook的节点和属性信息
   * 格式: { nodeUUID_propKey_hookType: { nodeUUID, propKey, hookType } }
   */
  private hookedProperties: Map<
    string,
    {
      nodeUUID: string;
      propKey: string;
      hookType: HookType;
    }
  > = new Map();

  /**
   * 获取HookManager实例
   */
  public static getInstance(): HookManager {
    if (!HookManager.instance) {
      HookManager.instance = new HookManager();
    }
    return HookManager.instance;
  }

  /**
   * 添加属性钩子
   * @param node 节点
   * @param propKey 属性键
   * @param hookType 钩子类型
   */
  public addHook(node: cc.Node, propKey: string, hookType: HookType): void {
    const config = PROPERTY_HOOK_MAPPINGS[propKey];
    if (!config) {
      console.error(`[HookManager] 未找到属性配置: ${propKey}`);
      return;
    }

    // 获取要hook的对象
    const targetObj = config.objectGetter ? config.objectGetter(node) : node;

    // 创建唯一标识
    const hookId = this.getHookId(node.uuid, propKey, hookType);

    // 检查是否已经hook
    if (this.isHooked(node.uuid, propKey, hookType)) {
      console.log(
        `[HookManager] 属性已经被hook: ${config.uiName}, 节点: ${node.name}(${node.uuid})`
      );
      return;
    }

    // 设置hook
    this.setPropertyHook(
      targetObj,
      config.targetProp,
      hookType,
      hookId,
      node.uuid,
      propKey
    );

    // 记录hook状态
    this.hookedProperties.set(hookId, {
      nodeUUID: node.uuid,
      propKey: propKey,
      hookType: hookType,
    });

    console.log(
      `[HookManager] 添加${
        hookType === "get" ? "读取" : hookType === "set" ? "写入" : "读写"
      }钩子: ${config.uiName}, 节点: ${node.name}(${node.uuid})`
    );
  }

  // 更多方法...
}
```

### 属性钩子实现

属性钩子使用 JavaScript 的对象存取器(getter/setter)机制实现：

```typescript
export class PropertyHook {
  /**
   * 为对象的属性设置钩子
   * @param obj 目标对象
   * @param prop 属性名
   * @param getCallback 读取回调
   * @param setCallback 设置回调
   */
  public static hook(
    obj: any,
    prop: string,
    getCallback?: (value: any) => void,
    setCallback?: (newValue: any, oldValue: any) => void
  ): boolean {
    if (!obj || typeof obj !== "object") {
      console.error("[PropertyHook] 目标对象必须是一个对象");
      return false;
    }

    try {
      // 保存原始值和原始描述符
      const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
      if (!descriptor) {
        console.error(`[PropertyHook] 属性 ${prop} 不存在`);
        return false;
      }

      // 保存原始值，如果是getter/setter则调用getter获取值
      let value = descriptor.get ? descriptor.get.call(obj) : descriptor.value;

      // 标记属性已被hook
      const hookKey = `__hooked_${prop}`;
      if ((obj as any)[hookKey]) {
        console.log(`[PropertyHook] 属性 ${prop} 已经被hook，将更新钩子`);
      }
      (obj as any)[hookKey] = true;

      // 定义新的属性描述符
      Object.defineProperty(obj, prop, {
        get: function () {
          // 调用原始getter或返回保存的值
          const originalValue = descriptor.get
            ? descriptor.get.call(this)
            : value;

          // 调用读取回调
          if (getCallback) {
            getCallback(originalValue);
          }

          return originalValue;
        },
        set: function (newVal) {
          const oldValue = descriptor.get ? descriptor.get.call(this) : value;

          // 调用写入回调
          if (setCallback) {
            setCallback(newVal, oldValue);
          }

          // 调用原始setter或更新保存的值
          if (descriptor.set) {
            descriptor.set.call(this, newVal);
          } else {
            value = newVal;
          }
        },
        enumerable: descriptor.enumerable,
        configurable: true,
      });

      return true;
    } catch (e) {
      console.error(`[PropertyHook] 设置hook失败: ${prop}`, e);
      return false;
    }
  }

  // 更多方法...
}
```

### 钩子配置映射

预定义的属性钩子配置：

```typescript
export const PROPERTY_HOOK_MAPPINGS: Record<string, PropertyHookConfig> = {
  // 位置相关
  position: {
    uiName: "位置",
    targetProp: "position",
    category: "变换",
  },
  "position.x": {
    uiName: "位置X",
    targetProp: "position",
    arrayIndex: 0,
    category: "变换",
  },
  "position.y": {
    uiName: "位置Y",
    targetProp: "position",
    arrayIndex: 1,
    category: "变换",
  },

  // 其他属性...
};
```

## 用户交互处理

钩子功能提供以下用户交互方式：

1. **钩子按钮**: 每个可钩子属性旁边提供钩子按钮
2. **状态指示器**: 显示钩子的当前状态（激活/未激活）
3. **确认对话框**: 添加读取钩子前显示确认对话框（因可能会影响性能）

```typescript
public static showReadHookConfirmation(node: cc.Node, propKey: string, buttonElement: HTMLElement): void {
  const config = PROPERTY_HOOK_MAPPINGS[propKey];
  if (!config) return;

  // 创建确认对话框
  const dialog = document.createElement('div');
  dialog.className = 'hook-confirmation-dialog';
  dialog.innerHTML = `
    <div class="hook-confirmation-content">
      <div class="hook-confirmation-title">确认添加读取钩子</div>
      <div class="hook-confirmation-message">
        添加读取钩子可能会对性能产生影响，特别是当属性频繁读取时。<br>
        确定要为 ${node.name} 的 ${config.uiName} 属性添加读取钩子吗？
      </div>
      <div class="hook-confirmation-buttons">
        <button class="hook-confirmation-cancel">取消</button>
        <button class="hook-confirmation-confirm">确认</button>
      </div>
    </div>
  `;

  // 添加到DOM
  document.body.appendChild(dialog);

  // 处理按钮点击
  const confirmBtn = dialog.querySelector('.hook-confirmation-confirm');
  const cancelBtn = dialog.querySelector('.hook-confirmation-cancel');

  confirmBtn?.addEventListener('click', () => {
    // 添加钩子
    HookManager.getInstance().addHook(node, propKey, 'get');
    buttonElement.classList.add('active');
    document.body.removeChild(dialog);
  });

  cancelBtn?.addEventListener('click', () => {
    document.body.removeChild(dialog);
  });
}
```

## 性能优化

为了确保钩子功能不会过度影响游戏性能，实现了以下优化：

1. **选择性启用**: 钩子功能默认不激活，需要用户主动启用
2. **读取钩子警告**: 添加读取钩子前显示性能警告
3. **局部应用**: 钩子仅应用于特定节点的特定属性
4. **可随时禁用**: 用户可以随时禁用不再需要的钩子

## 已知问题和限制

1. 部分引擎内部属性可能无法正确钩子
2. 对于复杂对象或循环引用结构，钩子可能导致日志输出过多
3. 在高频率访问的属性上添加钩子可能严重影响性能
4. 某些钩子可能在场景切换时失效

## 未来计划

1. 添加高级过滤功能，可按条件触发钩子
2. 支持导出钩子记录到文件
3. 提供可视化的属性变化图表
4. 添加条件断点功能
