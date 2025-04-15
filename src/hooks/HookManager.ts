import { HookType, PROPERTY_HOOK_MAPPINGS } from './HookConfig';
import { PropertyHook } from './PropertyHook';

/**
 * 钩子管理器 - 负责管理所有属性的钩子
 */
export class HookManager {
    private static instance: HookManager;

    /**
     * 存储已hook的节点和属性信息
     * 格式: { nodeUUID_propKey_hookType: { nodeUUID, propKey, hookType } }
     */
    private hookedProperties: Map<string, {
        nodeUUID: string,
        propKey: string,
        hookType: HookType
    }> = new Map();

    /**
     * 私有构造函数(单例模式)
     */
    private constructor() { }

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
            console.log(`[HookManager] 属性已经被hook: ${config.uiName}, 节点: ${node.name}(${node.uuid})`);
            return;
        }

        // 设置hook
        this.setPropertyHook(targetObj, config.targetProp, hookType, hookId, node.uuid, propKey);

        // 记录hook状态
        this.hookedProperties.set(hookId, {
            nodeUUID: node.uuid,
            propKey: propKey,
            hookType: hookType
        });

        console.log(`[HookManager] 添加${hookType === 'get' ? '读取' : hookType === 'set' ? '写入' : '读写'}钩子: ${config.uiName}, 节点: ${node.name}(${node.uuid})`);
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
            console.log(`[HookManager] 属性未被hook: ${config.uiName}, 节点: ${node.name}(${node.uuid})`);
            return;
        }

        // 移除hook
        let success = false;
        try {
            if (config.arrayIndex !== undefined) {
                // 获取要操作的数组和索引
                const arrayPropertyName = `${config.targetProp}[${config.arrayIndex}]`;
                console.log(`[HookManager] 尝试移除数组元素钩子: ${arrayPropertyName}, 节点: ${node.name}(${node.uuid})`);

                // 处理数组元素钩子
                success = PropertyHook.unhookArrayElement(targetObj, config.targetProp);
            } else {
                // 普通属性钩子
                console.log(`[HookManager] 尝试移除普通属性钩子: ${config.targetProp}, 节点: ${node.name}(${node.uuid})`);
                success = PropertyHook.unhook(targetObj, config.targetProp);
            }

            if (success) {
                // 移除记录
                this.hookedProperties.delete(hookId);
                console.log(`[HookManager] 移除${hookType === 'get' ? '读取' : hookType === 'set' ? '写入' : '读写'}钩子: ${config.uiName}, 节点: ${node.name}(${node.uuid})`);
            } else {
                console.error(`[HookManager] 钩子移除失败: ${config.uiName}, 节点: ${node.name}(${node.uuid})`);
            }
        } catch (e) {
            console.error(`[HookManager] 移除钩子时发生错误: ${config.uiName}, 节点: ${node.name}(${node.uuid})`, e);
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
    public isHooked(nodeUUID: string, propKey: string, hookType: HookType): boolean {
        const hookId = this.getHookId(nodeUUID, propKey, hookType);
        return this.hookedProperties.has(hookId);
    }

    /**
     * 根据节点和属性获取所有活跃的钩子
     * @param nodeUUID 节点UUID
     */
    public getActiveHooks(nodeUUID: string): { propKey: string, hookType: HookType }[] {
        const result: { propKey: string, hookType: HookType }[] = [];

        this.hookedProperties.forEach((info) => {
            if (info.nodeUUID === nodeUUID) {
                result.push({
                    propKey: info.propKey,
                    hookType: info.hookType
                });
            }
        });

        return result;
    }

    /**
     * 构建钩子的唯一标识
     */
    private getHookId(nodeUUID: string, propKey: string, hookType: HookType): string {
        return `${nodeUUID}_${propKey}_${hookType}`;
    }

    /**
     * 应用实际的钩子
     */
    private setPropertyHook(obj: any, prop: string, hookType: HookType, hookId: string, nodeUUID: string, propKey: string): void {
        const config = PROPERTY_HOOK_MAPPINGS[propKey];
        if (!config) {
            console.error(`[HookManager] 未找到属性配置: ${propKey}`);
            return;
        }

        // 检查是否是数组元素hook
        if (config.arrayIndex !== undefined) {
            this.setArrayElementHook(obj, prop, config.arrayIndex, hookType, hookId, nodeUUID, propKey);
            return;
        }

        let getCallback: ((value: any) => void) | undefined = undefined;
        let setCallback: ((newValue: any, oldValue: any) => void) | undefined = undefined;

        if (hookType === 'get' || hookType === 'both') {
            getCallback = (value: any) => {
                debugger; // 读取断点
                console.log(`[属性钩子] 读取属性 ${prop}: ${this.formatValue(value)}, 节点UUID: ${nodeUUID}`);
            };
        }

        if (hookType === 'set' || hookType === 'both') {
            setCallback = (newValue: any, oldValue: any) => {
                debugger; // 写入断点
                console.log(`[属性钩子] 修改属性 ${prop}: ${this.formatValue(oldValue)} -> ${this.formatValue(newValue)}, 节点UUID: ${nodeUUID}`);
            };
        }

        // 应用hook
        PropertyHook.hook(obj, prop, getCallback, setCallback);
    }

    /**
     * 为数组元素设置钩子
     */
    private setArrayElementHook(obj: any, arrayProp: string, index: number, hookType: HookType, hookId: string, nodeUUID: string, propKey: string): void {
        let onGet: ((value: any, index: number) => void) | undefined = undefined;
        let onSet: ((newValue: any, oldValue: any, index: number) => void) | undefined = undefined;

        const arrayPropertyName = `${arrayProp}[${index}]`;

        if (hookType === 'get' || hookType === 'both') {
            onGet = (array: any, idx: number) => {
                debugger; // 读取断点
                // 检查数组或类型数组是否有效
                if (array && typeof array === 'object' && 'length' in array && idx < array.length) {
                    console.log(`[属性钩子] 读取${propKey}属性: ${this.formatValue(array[idx])}, 节点UUID: ${nodeUUID}`);
                } else {
                    console.error(`[属性钩子] 无法读取${arrayPropertyName}, 节点UUID: ${nodeUUID}`);
                }
            };
        }

        if (hookType === 'set' || hookType === 'both') {
            onSet = (newArray: any, oldArray: any, idx: number) => {
                debugger; // 写入断点
                // 检查数组类型
                if (newArray && oldArray &&
                    typeof newArray === 'object' && typeof oldArray === 'object' &&
                    'length' in newArray && 'length' in oldArray &&
                    idx < newArray.length && idx < oldArray.length) {

                    // 获取新旧值
                    const newValue = newArray[idx];
                    const oldValue = oldArray[idx];

                    console.log(`[属性钩子] 修改${propKey}属性: ${this.formatValue(oldValue)} -> ${this.formatValue(newValue)}, 节点UUID: ${nodeUUID}`);
                } else {
                    console.error(`[属性钩子] 无法监测${arrayPropertyName}的变化, 节点UUID: ${nodeUUID}`);
                }
            };
        }

        // 应用数组元素hook
        try {
            PropertyHook.hookArrayElement(obj, arrayProp, index, onGet, onSet);
            console.log(`[HookManager] 成功应用${hookType}钩子到 ${arrayPropertyName}, 节点UUID: ${nodeUUID}`);
        } catch (e) {
            console.error(`[HookManager] 应用钩子到 ${arrayPropertyName} 失败: `, e);
        }
    }

    /**
     * 格式化值输出
     */
    private formatValue(value: any): string {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';

        if (typeof value === 'object') {
            try {
                // 对于Vector3等对象尝试格式化x,y,z坐标
                if (value.x !== undefined && value.y !== undefined) {
                    if (value.z !== undefined) {
                        return `(${value.x.toFixed(2)}, ${value.y.toFixed(2)}, ${value.z.toFixed(2)})`;
                    }
                    return `(${value.x.toFixed(2)}, ${value.y.toFixed(2)})`;
                }

                return JSON.stringify(value);
            } catch (e) {
                return '[对象]';
            }
        }

        return value.toString();
    }
} 