/**
 * 属性钩子工具 - 用于在属性读写时插入断点和日志
 */
export class PropertyHook {
    /**
     * 为对象的属性设置钩子
     * @param obj 目标对象
     * @param prop 属性名
     * @param onGet 读取回调
     * @param onSet 写入回调
     * @param defaultValue 默认值
     */
    static hook(obj: any, prop: string, onGet?: (value: any) => void, onSet?: (newValue: any, oldValue: any) => void, defaultValue?: any): void {
        if (!obj || typeof obj !== 'object') {
            console.error('[PropertyHook] 无效的对象');
            return;
        }

        const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
        if (!descriptor || (!descriptor.get && !descriptor.set && !descriptor.writable)) {
            console.error(`[PropertyHook] 属性 ${prop} 不可配置`);
            return;
        }

        let value = obj.hasOwnProperty(prop) ? obj[prop] : defaultValue;

        Object.defineProperty(obj, prop, {
            get: function () {
                if (onGet) {
                    onGet(value);
                }
                return value;
            },
            set: function (newValue) {
                const oldValue = value;
                value = newValue;
                if (onSet) {
                    onSet(newValue, oldValue);
                }
            },
            enumerable: descriptor?.enumerable || false,
            configurable: true
        });
    }

    /**
     * 检查是否为TypedArray类型
     * @param obj 要检查的对象
     */
    private static isTypedArray(obj: any): boolean {
        return obj && typeof obj === 'object' &&
            ArrayBuffer.isView(obj) && !(obj instanceof DataView);
    }

    /**
     * 为对象的数组属性的特定索引设置钩子，使用Proxy实现
     * @param obj 目标对象
     * @param prop 数组属性名
     * @param index 数组索引
     * @param onGet 读取回调
     * @param onSet 写入回调
     */
    static hookArrayElement(obj: any, prop: string, index: number, onGet?: (value: any, index: number) => void, onSet?: (newValue: any, oldValue: any, index: number) => void): void {
        if (!obj || typeof obj !== 'object') {
            console.error('[PropertyHook] 无效的对象');
            return;
        }

        // 检查属性是否存在
        if (!(prop in obj)) {
            console.error(`[PropertyHook] 属性 ${prop} 不存在`);
            return;
        }

        // 获取原始数组引用
        const originalArray = obj[prop];

        // 检查是否为数组类型或类数组对象（如TypedArray）
        const isArrayLike = Array.isArray(originalArray) ||
            (originalArray && typeof originalArray === 'object' &&
                'length' in originalArray && typeof originalArray.length === 'number');

        // 检查是否为TypedArray
        const isTyped = this.isTypedArray(originalArray);

        if (!isArrayLike) {
            console.error(`[PropertyHook] 属性 ${prop} 不是数组或类数组对象`);
            return;
        }

        if (isTyped) {
            console.log(`[PropertyHook] 属性 ${prop} 是TypedArray类型: ${originalArray.constructor.name}`);
        }

        // 创建一个代理对象来拦截数组的访问
        const arrayProxy = new Proxy(originalArray, {
            get: function (target, prop) {
                // 如果是访问目标索引
                if (prop === index.toString()) {
                    const value = target[prop];
                    if (onGet) {
                        onGet(target, index);
                    }
                    return value;
                }
                return target[prop];
            },
            set: function (target, prop, value) {
                // 如果是修改目标索引
                if (prop === index.toString()) {
                    const oldValue = target[prop];
                    // 设置新值
                    target[prop] = value;
                    if (onSet) {
                        // 对于TypedArray，我们无法使用...spread语法
                        let oldState;
                        if (isTyped) {
                            // 创建保存旧值的对象
                            oldState = new (target.constructor as any)(target);
                            oldState[prop] = oldValue;
                        } else {
                            oldState = { ...target, [prop]: oldValue };
                        }
                        onSet(target, oldState, index);
                    }
                    return true;
                }
                target[prop] = value;
                return true;
            }
        });

        // 替换原始属性，返回代理
        const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
        Object.defineProperty(obj, prop, {
            get: function () {
                return arrayProxy;
            },
            set: function (newArray) {
                // 当整个数组被替换时，我们需要重新创建代理
                if (onSet) {
                    onSet(newArray, originalArray, index);
                }

                // 更新原始数组引用
                // 这里使用一个特殊技巧：暂时删除我们的代理，设置原始值，然后重新定义属性
                delete obj[prop];
                obj[prop] = newArray;

                // 重新应用钩子到新数组
                PropertyHook.hookArrayElement(obj, prop, index, onGet, onSet);
            },
            enumerable: descriptor?.enumerable || false,
            configurable: true
        });
    }

    /**
     * 移除属性钩子
     * @param obj 目标对象
     * @param prop 属性名
     */
    static unhook(obj: any, prop: string): boolean {
        if (!obj || typeof obj !== 'object') {
            console.error('[PropertyHook] 无效的对象');
            return false;
        }

        try {
            // 获取当前属性值
            const currentValue = obj[prop];

            // 删除当前属性描述符
            delete obj[prop];

            // 直接重新赋值
            obj[prop] = currentValue;

            return true;
        } catch (e) {
            console.error(`[PropertyHook] 移除钩子失败: ${prop}`, e);
            return false;
        }
    }

    /**
     * 移除数组元素钩子
     * @param obj 目标对象
     * @param prop 数组属性名
     */
    static unhookArrayElement(obj: any, prop: string): boolean {
        if (!obj || typeof obj !== 'object') {
            console.error('[PropertyHook] 无效的对象');
            return false;
        }

        try {
            // 获取当前的代理数组
            const currentProxy = obj[prop];

            // 如果不是对象或数组类对象，则可能未应用钩子
            if (!currentProxy || typeof currentProxy !== 'object' || !('length' in currentProxy)) {
                console.error(`[PropertyHook] 属性 ${prop} 不是被代理的数组或类数组对象`);
                return false;
            }

            // 检查是否为TypedArray
            const isTypedArray = this.isTypedArray(currentProxy);

            // 提取底层的原始数组数据
            let originalArrayData;
            if (isTypedArray) {
                // 对于TypedArray，需要使用其构造函数创建新实例
                originalArrayData = new (currentProxy.constructor as any)(currentProxy);
            } else if (Array.isArray(currentProxy)) {
                // 标准数组可以使用展开运算符
                originalArrayData = [...currentProxy];
            } else {
                // 其他类型的类数组对象
                originalArrayData = new (currentProxy.constructor as any)(currentProxy.length);
                for (let i = 0; i < currentProxy.length; i++) {
                    originalArrayData[i] = currentProxy[i];
                }
            }

            // 删除当前属性描述符（移除代理）
            delete obj[prop];

            // 将原始数组数据重新分配给属性
            obj[prop] = originalArrayData;

            console.log(`[PropertyHook] 成功移除${isTypedArray ? 'TypedArray' : '数组'}元素钩子: ${prop}`);
            return true;
        } catch (e) {
            console.error(`[PropertyHook] 移除数组元素钩子失败: ${prop}`, e);
            return false;
        }
    }
} 