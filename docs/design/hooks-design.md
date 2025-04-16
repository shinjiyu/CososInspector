# 钩子系统设计文档

## 设计概述

钩子系统是 Cocos Inspector 的高级调试功能，允许开发者监控和拦截 Cocos 对象属性的读取和修改操作。它通过 JavaScript 的对象属性描述符机制，为目标对象的属性添加自定义的访问器，实现了对属性访问的监控、记录和调试。本文档详细描述了钩子系统的设计原理、核心组件和实现细节。

## 系统设计

### 设计目标

1. **非侵入性**: 不修改 Cocos 引擎的核心代码
2. **可配置性**: 允许用户选择要监控的属性和监控方式
3. **低开销**: 确保钩子机制对游戏性能的影响最小化
4. **可视化**: 提供直观的界面控制和状态显示
5. **可靠性**: 确保钩子的添加和移除过程稳定可靠

### 核心组件

钩子系统由以下核心组件组成：

1. **PropertyHook 类**: 实现属性钩子的核心逻辑
2. **HookManager 类**: 管理所有已设置的钩子
3. **HookConfig**: 定义钩子的配置信息
4. **HookUIRenderer**: 提供钩子系统的界面渲染和交互

## 关键概念

### 钩子类型

系统支持三种类型的钩子：

1. **读取钩子 (Get Hook)**: 监控属性的读取操作
2. **写入钩子 (Set Hook)**: 监控属性的修改操作
3. **读写钩子 (Both Hook)**: 同时监控属性的读取和修改操作

### 钩子配置

每个可钩子的属性都有对应的配置信息：

```typescript
export interface PropertyHookConfig {
  /** UI中显示的属性名 */
  uiName: string;
  /** 实际要hook的属性 */
  targetProp: string;
  /** 属性分类 */
  category: string;
  /** 可选：获取要hook的对象 (默认为节点自身) */
  objectGetter?: (node: cc.Node) => any;
  /** 可选：数组索引，用于hook数组中的特定元素 */
  arrayIndex?: number;
}
```

## 系统实现

### PropertyHook 类

`PropertyHook` 类是钩子系统的核心，负责实现属性钩子的添加和移除：

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

  /**
   * 移除对象属性的钩子
   * @param obj 目标对象
   * @param prop 属性名
   */
  public static unhook(obj: any, prop: string): boolean {
    if (!obj || typeof obj !== "object") {
      console.error("[PropertyHook] 目标对象必须是一个对象");
      return false;
    }

    const hookKey = `__hooked_${prop}`;
    if (!(obj as any)[hookKey]) {
      console.log(`[PropertyHook] 属性 ${prop} 未被hook，无需移除`);
      return false;
    }

    try {
      // 获取当前描述符
      const currentDescriptor = Object.getOwnPropertyDescriptor(obj, prop);
      if (!currentDescriptor) {
        console.error(`[PropertyHook] 无法获取当前属性描述符: ${prop}`);
        return false;
      }

      // 获取原始值
      const value = currentDescriptor.get
        ? currentDescriptor.get.call(obj)
        : undefined;

      // 移除hook标记
      delete (obj as any)[hookKey];

      // 恢复原始的属性行为 (基于当前值)
      Object.defineProperty(obj, prop, {
        value: value,
        writable: true,
        enumerable: currentDescriptor.enumerable,
        configurable: true,
      });

      return true;
    } catch (e) {
      console.error(`[PropertyHook] 移除hook失败: ${prop}`, e);
      return false;
    }
  }

  /**
   * 为数组元素设置钩子
   * @param obj 包含数组的对象
   * @param arrayProp 数组属性名
   * @param index 元素索引
   * @param getCallback 读取回调
   * @param setCallback 设置回调
   */
  public static hookArrayElement(
    obj: any,
    arrayProp: string,
    index: number,
    getCallback?: (value: any) => void,
    setCallback?: (newValue: any, oldValue: any) => void
  ): boolean {
    try {
      // 检查对象和数组属性
      if (!obj || typeof obj !== "object") {
        console.error("[PropertyHook] 目标对象必须是一个对象");
        return false;
      }

      const array = obj[arrayProp];
      if (!Array.isArray(array) && !(array instanceof Float32Array)) {
        console.error(`[PropertyHook] 属性 ${arrayProp} 不是数组或类数组对象`);
        return false;
      }

      // 获取数组元素的当前值
      const currentValue = array[index];

      // 创建代理数组
      const originalArray = array;
      const proxyArray = new Proxy(originalArray, {
        get(target, prop) {
          if (prop === String(index)) {
            const value = target[index];
            if (getCallback) {
              getCallback(value);
            }
            return value;
          }
          return target[prop];
        },
        set(target, prop, value) {
          if (prop === String(index)) {
            const oldValue = target[index];
            if (setCallback) {
              setCallback(value, oldValue);
            }
          }
          target[prop] = value;
          return true;
        },
      });

      // 替换原始数组
      obj[arrayProp] = proxyArray;

      // 标记数组已被hook
      const hookKey = `__hooked_array_${arrayProp}_${index}`;
      (obj as any)[hookKey] = true;

      return true;
    } catch (e) {
      console.error(
        `[PropertyHook] 设置数组元素hook失败: ${arrayProp}[${index}]`,
        e
      );
      return false;
    }
  }

  /**
   * 移除数组元素的钩子
   * @param obj 包含数组的对象
   * @param arrayProp 数组属性名
   */
  public static unhookArrayElement(obj: any, arrayProp: string): boolean {
    try {
      // 检查对象
      if (!obj || typeof obj !== "object") {
        console.error("[PropertyHook] 目标对象必须是一个对象");
        return false;
      }

      // 检查是否有任何数组元素被hook
      let hasHookedElements = false;
      for (const key in obj) {
        if (key.startsWith(`__hooked_array_${arrayProp}_`)) {
          hasHookedElements = true;
          delete obj[key];
        }
      }

      if (!hasHookedElements) {
        console.log(`[PropertyHook] 数组 ${arrayProp} 没有被hook的元素`);
        return false;
      }

      // 获取当前代理数组
      const proxyArray = obj[arrayProp];
      if (!proxyArray) {
        console.error(`[PropertyHook] 找不到数组 ${arrayProp}`);
        return false;
      }

      // 获取原始数组并恢复
      // 注意：由于Proxy的限制，可能无法完全恢复原始数组
      // 但我们可以创建一个新数组并复制所有值
      const newArray = Array.isArray(proxyArray)
        ? [...proxyArray]
        : new Float32Array(proxyArray);
      obj[arrayProp] = newArray;

      return true;
    } catch (e) {
      console.error(`[PropertyHook] 移除数组元素hook失败: ${arrayProp}`, e);
      return false;
    }
  }
}
```

`PropertyHook` 类的主要功能包括：

1. **属性钩子**: 通过 `hook` 方法为对象属性添加钩子
2. **钩子移除**: 通过 `unhook` 方法移除对象属性的钩子
3. **数组元素钩子**: 通过 `hookArrayElement` 方法为数组元素添加钩子
4. **数组钩子移除**: 通过 `unhookArrayElement` 方法移除数组元素的钩子

### HookManager 类

`HookManager` 类是钩子系统的管理中心，负责钩子的添加、移除和状态维护：

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
   * 私有构造函数(单例模式)
   */
  private constructor() {}

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

  /**
   * 移除属性钩子
   * @param node 节点
   * @param propKey 属性键
   * @param hookType 钩子类型
   */
  public removeHook(node: cc.Node, propKey: string, hookType: HookType): void {
    const config = PROPERTY_HOOK_MAPPINGS[propKey];
    if (!config) {
      console.error(`[HookManager] 未找到属性配置: ${propKey}`);
      return;
    }

    // 获取要unhook的对象
    const targetObj = config.objectGetter ? config.objectGetter(node) : node;

    // 创建唯一标识
    const hookId = this.getHookId(node.uuid, propKey, hookType);

    // 检查是否已经hook
    if (!this.isHooked(node.uuid, propKey, hookType)) {
      console.log(
        `[HookManager] 属性未被hook: ${config.uiName}, 节点: ${node.name}(${node.uuid})`
      );
      return;
    }

    // 移除hook
    let success = false;
    try {
      if (config.arrayIndex !== undefined) {
        // 处理数组元素钩子
        success = PropertyHook.unhookArrayElement(targetObj, config.targetProp);
      } else {
        // 普通属性钩子
        success = PropertyHook.unhook(targetObj, config.targetProp);
      }

      if (success) {
        // 移除记录
        this.hookedProperties.delete(hookId);
        console.log(
          `[HookManager] 移除${
            hookType === "get" ? "读取" : hookType === "set" ? "写入" : "读写"
          }钩子: ${config.uiName}, 节点: ${node.name}(${node.uuid})`
        );
      } else {
        console.error(
          `[HookManager] 钩子移除失败: ${config.uiName}, 节点: ${node.name}(${node.uuid})`
        );
      }
    } catch (e) {
      console.error(
        `[HookManager] 移除钩子时发生错误: ${config.uiName}, 节点: ${node.name}(${node.uuid})`,
        e
      );
      // 即使出错，也从记录中移除，避免状态不一致
      this.hookedProperties.delete(hookId);
    }
  }

  /**
   * 检查属性是否已被hook
   * @param nodeUUID 节点UUID
   * @param propKey 属性键
   * @param hookType 钩子类型
   */
  public isHooked(
    nodeUUID: string,
    propKey: string,
    hookType: HookType
  ): boolean {
    const hookId = this.getHookId(nodeUUID, propKey, hookType);
    return this.hookedProperties.has(hookId);
  }

  /**
   * 根据节点和属性获取所有活跃的钩子
   * @param nodeUUID 节点UUID
   */
  public getActiveHooks(
    nodeUUID: string
  ): { propKey: string; hookType: HookType }[] {
    const result: { propKey: string; hookType: HookType }[] = [];

    this.hookedProperties.forEach((info) => {
      if (info.nodeUUID === nodeUUID) {
        result.push({
          propKey: info.propKey,
          hookType: info.hookType,
        });
      }
    });

    return result;
  }

  /**
   * 构建钩子的唯一标识
   */
  private getHookId(
    nodeUUID: string,
    propKey: string,
    hookType: HookType
  ): string {
    return `${nodeUUID}_${propKey}_${hookType}`;
  }

  /**
   * 应用实际的钩子
   */
  private setPropertyHook(
    obj: any,
    prop: string,
    hookType: HookType,
    hookId: string,
    nodeUUID: string,
    propKey: string
  ): void {
    const config = PROPERTY_HOOK_MAPPINGS[propKey];
    if (!config) {
      console.error(`[HookManager] 未找到属性配置: ${propKey}`);
      return;
    }

    // 检查是否是数组元素hook
    if (config.arrayIndex !== undefined) {
      this.setArrayElementHook(
        obj,
        prop,
        config.arrayIndex,
        hookType,
        hookId,
        nodeUUID,
        propKey
      );
      return;
    }

    let getCallback: ((value: any) => void) | undefined = undefined;
    let setCallback: ((newValue: any, oldValue: any) => void) | undefined =
      undefined;

    if (hookType === "get" || hookType === "both") {
      getCallback = (value: any) => {
        debugger; // 读取断点
        console.log(
          `[属性钩子] 读取属性 ${prop}: ${this.formatValue(
            value
          )}, 节点UUID: ${nodeUUID}`
        );
      };
    }

    if (hookType === "set" || hookType === "both") {
      setCallback = (newValue: any, oldValue: any) => {
        debugger; // 写入断点
        console.log(
          `[属性钩子] 修改属性 ${prop}: ${this.formatValue(
            oldValue
          )} -> ${this.formatValue(newValue)}, 节点UUID: ${nodeUUID}`
        );
      };
    }

    // 应用hook
    PropertyHook.hook(obj, prop, getCallback, setCallback);
  }

  /**
   * 为数组元素设置钩子
   */
  private setArrayElementHook(
    obj: any,
    arrayProp: string,
    index: number,
    hookType: HookType,
    hookId: string,
    nodeUUID: string,
    propKey: string
  ): void {
    const config = PROPERTY_HOOK_MAPPINGS[propKey];
    if (!config) return;

    let getCallback: ((value: any) => void) | undefined = undefined;
    let setCallback: ((newValue: any, oldValue: any) => void) | undefined =
      undefined;

    if (hookType === "get" || hookType === "both") {
      getCallback = (value: any) => {
        debugger; // 读取断点
        console.log(
          `[属性钩子] 读取数组元素 ${arrayProp}[${index}]: ${this.formatValue(
            value
          )}, 节点UUID: ${nodeUUID}`
        );
      };
    }

    if (hookType === "set" || hookType === "both") {
      setCallback = (newValue: any, oldValue: any) => {
        debugger; // 写入断点
        console.log(
          `[属性钩子] 修改数组元素 ${arrayProp}[${index}]: ${this.formatValue(
            oldValue
          )} -> ${this.formatValue(newValue)}, 节点UUID: ${nodeUUID}`
        );
      };
    }

    // 应用数组元素hook
    PropertyHook.hookArrayElement(
      obj,
      arrayProp,
      index,
      getCallback,
      setCallback
    );
  }

  /**
   * 格式化值以便于显示
   */
  private formatValue(value: any): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";

    if (typeof value === "object") {
      // 简化对象显示
      if (
        value instanceof cc.Vec2 ||
        value instanceof cc.Vec3 ||
        value instanceof cc.Vec4
      ) {
        return JSON.stringify({
          x: value.x,
          y: value.y,
          z: value.z,
          w: value.w,
        });
      }

      if (value instanceof cc.Color) {
        return `rgba(${value.r}, ${value.g}, ${value.b}, ${value.a})`;
      }

      // 防止循环引用
      try {
        return JSON.stringify(value);
      } catch (e) {
        return "[复杂对象]";
      }
    }

    return String(value);
  }
}
```

`HookManager` 类的主要功能包括：

1. **单例模式**: 确保系统中只有一个钩子管理器实例
2. **钩子添加**: 通过 `addHook` 方法添加属性钩子
3. **钩子移除**: 通过 `removeHook` 方法移除属性钩子
4. **钩子状态检查**: 通过 `isHooked` 方法检查属性是否已被钩子
5. **钩子查询**: 通过 `getActiveHooks` 方法获取节点的所有活跃钩子
6. **类型处理**: 处理普通属性和数组元素的不同钩子逻辑

### 钩子配置

系统预定义了一组常用属性的钩子配置：

```typescript
export type HookType = "get" | "set" | "both";

export interface PropertyHookConfig {
  uiName: string;
  targetProp: string;
  category: string;
  objectGetter?: (node: cc.Node) => any;
  arrayIndex?: number;
}

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
  "position.z": {
    uiName: "位置Z",
    targetProp: "position",
    arrayIndex: 2,
    category: "变换",
  },

  // 旋转相关
  rotation: {
    uiName: "旋转",
    targetProp: "rotation",
    category: "变换",
  },
  "rotation.x": {
    uiName: "旋转X",
    targetProp: "rotation",
    arrayIndex: 0,
    category: "变换",
  },
  "rotation.y": {
    uiName: "旋转Y",
    targetProp: "rotation",
    arrayIndex: 1,
    category: "变换",
  },
  "rotation.z": {
    uiName: "旋转Z",
    targetProp: "rotation",
    arrayIndex: 2,
    category: "变换",
  },

  // 缩放相关
  scale: {
    uiName: "缩放",
    targetProp: "scale",
    category: "变换",
  },
  "scale.x": {
    uiName: "缩放X",
    targetProp: "scale",
    arrayIndex: 0,
    category: "变换",
  },
  "scale.y": {
    uiName: "缩放Y",
    targetProp: "scale",
    arrayIndex: 1,
    category: "变换",
  },
  "scale.z": {
    uiName: "缩放Z",
    targetProp: "scale",
    arrayIndex: 2,
    category: "变换",
  },

  // 可见性相关
  active: {
    uiName: "激活状态",
    targetProp: "active",
    category: "节点",
  },
  opacity: {
    uiName: "透明度",
    targetProp: "opacity",
    category: "节点",
    objectGetter: (node) => node.color,
  },

  // 更多属性配置...
};
```

### HookUIRenderer 类

`HookUIRenderer` 类负责钩子系统的界面渲染和交互：

```typescript
export class HookUIRenderer {
  /**
   * 渲染属性钩子按钮
   * @param propName 属性名
   * @param propKey 属性配置键
   * @param nodeUUID 节点UUID
   */
  public static renderHookButtons(
    propName: string,
    propKey: string,
    nodeUUID: string
  ): string {
    const hookManager = HookManager.getInstance();

    // 检查属性是否支持钩子
    if (!PROPERTY_HOOK_MAPPINGS[propKey]) {
      return "";
    }

    // 获取钩子状态
    const isGetHooked = hookManager.isHooked(nodeUUID, propKey, "get");
    const isSetHooked = hookManager.isHooked(nodeUUID, propKey, "set");

    // 生成钩子按钮HTML
    return `
      <div class="hook-buttons">
        <button class="hook-btn get-hook ${isGetHooked ? "active" : ""}" 
                title="监听属性读取" 
                data-prop-key="${propKey}" 
                data-hook-type="get">👁️</button>
        <button class="hook-btn set-hook ${isSetHooked ? "active" : ""}" 
                title="监听属性修改" 
                data-prop-key="${propKey}" 
                data-hook-type="set">✏️</button>
      </div>
    `;
  }

  /**
   * 初始化钩子按钮点击事件监听
   * @param container 容器元素
   * @param getSelectedNode 获取当前选中节点的函数
   */
  public static initHookButtonListeners(
    container: HTMLElement,
    getSelectedNode: () => cc.Node | null
  ): void {
    container.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains("hook-btn")) return;

      const propKey = target.dataset.propKey;
      const hookType = target.dataset.hookType as "get" | "set";
      const node = getSelectedNode();

      if (!propKey || !hookType || !node) return;

      const hookManager = HookManager.getInstance();

      if (target.classList.contains("active")) {
        // 移除hook
        hookManager.removeHook(node, propKey, hookType);
        target.classList.remove("active");
      } else {
        // 对于读钩子，显示确认对话框
        if (hookType === "get") {
          this.showReadHookConfirmation(node, propKey, target);
        } else {
          // 直接添加写钩子
          hookManager.addHook(node, propKey, hookType);
          target.classList.add("active");
        }
      }
    });
  }

  /**
   * 显示读取钩子确认对话框
   * @param node 节点
   * @param propKey 属性键
   * @param buttonElement 按钮元素
   */
  public static showReadHookConfirmation(
    node: cc.Node,
    propKey: string,
    buttonElement: HTMLElement
  ): void {
    const config = PROPERTY_HOOK_MAPPINGS[propKey];
    if (!config) return;

    // 创建确认对话框
    const dialog = document.createElement("div");
    dialog.className = "hook-confirmation-dialog";
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
    const confirmBtn = dialog.querySelector(".hook-confirmation-confirm");
    const cancelBtn = dialog.querySelector(".hook-confirmation-cancel");

    confirmBtn?.addEventListener("click", () => {
      // 添加钩子
      HookManager.getInstance().addHook(node, propKey, "get");
      buttonElement.classList.add("active");
      document.body.removeChild(dialog);
    });

    cancelBtn?.addEventListener("click", () => {
      document.body.removeChild(dialog);
    });
  }
}
```

`HookUIRenderer` 类的主要功能包括：

1. **钩子按钮渲染**: 通过 `renderHookButtons` 方法渲染属性钩子按钮
2. **事件监听初始化**: 通过 `initHookButtonListeners` 方法初始化钩子按钮的事件监听
3. **确认对话框**: 通过 `showReadHookConfirmation` 方法显示读取钩子的确认对话框

## 用户交互流程

钩子系统的用户交互流程如下：

1. **选择节点**: 用户在节点树中选择一个节点
2. **查看属性**: 在属性面板中查看节点属性
3. **设置钩子**: 点击属性旁的钩子按钮设置钩子
   - 设置写入钩子: 直接设置
   - 设置读取钩子: 显示确认对话框，确认后设置
4. **触发钩子**: 当属性被读取或修改时，钩子被触发
   - 控制台输出属性访问信息
   - 触发调试器断点
5. **移除钩子**: 再次点击钩子按钮移除钩子

## 技术挑战与解决方案

### 挑战 1: 数组元素钩子

数组元素(如 position.x)的钩子无法直接使用普通属性钩子机制实现，因为修改数组元素不会触发数组本身的 setter。

**解决方案**: 使用 JavaScript 的 Proxy 机制拦截数组的属性访问，为特定索引位置添加拦截器。

### 挑战 2: 原始类型恢复

移除钩子时，需要恢复属性的原始行为，但原始描述符可能已经丢失。

**解决方案**: 在添加钩子时保存原始描述符信息，移除钩子时使用当前值创建新的属性描述符。

### 挑战 3: 性能影响

读取钩子可能严重影响性能，特别是对于频繁访问的属性。

**解决方案**:

1. 对读取钩子添加确认对话框，提醒用户潜在的性能影响
2. 提供精确的钩子控制，允许用户只钩子特定属性
3. 在控制台输出中标明钩子类型和目标属性，便于追踪

## 最佳实践

### 钩子使用建议

1. **谨慎使用读取钩子**: 只在必要时使用读取钩子，以避免性能问题
2. **优先使用写入钩子**: 写入钩子的性能影响通常较小
3. **及时移除钩子**: 调试完成后及时移除不再需要的钩子
4. **选择精确的属性**: 尽量钩子具体的子属性，而不是整个对象

### 扩展钩子系统

要扩展钩子系统支持新的属性，只需在 `PROPERTY_HOOK_MAPPINGS` 中添加新的配置：

```typescript
// 添加新的属性钩子配置
PROPERTY_HOOK_MAPPINGS["customProperty"] = {
  uiName: "自定义属性",
  targetProp: "customProperty",
  category: "自定义",
};

// 添加支持自定义对象getter的属性
PROPERTY_HOOK_MAPPINGS["componentProperty"] = {
  uiName: "组件属性",
  targetProp: "value",
  category: "组件",
  objectGetter: (node) => node.getComponent("CustomComponent"),
};
```

## 未来计划

1. **条件钩子**: 支持根据条件触发钩子，如"仅当值变化超过阈值时触发"
2. **钩子分组**: 支持将多个相关的钩子组合为一个分组
3. **钩子导出/导入**: 支持保存和加载钩子配置
4. **高级过滤**: 支持更复杂的过滤规则
5. **可视化监控**: 提供属性变化的可视化图表
