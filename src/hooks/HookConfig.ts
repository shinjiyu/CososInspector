/**
 * 属性钩子配置接口
 */
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

/**
 * 钩子类型
 */
export type HookType = 'get' | 'set' | 'both';

/**
 * 属性映射表 - 定义UI属性与实际hook属性之间的关系
 */
export const PROPERTY_HOOK_MAPPINGS: { [key: string]: PropertyHookConfig } = {
    "position": {
        uiName: "Position",
        targetProp: "_trs",
        category: "transform"
    },
    "position.x": {
        uiName: "Position X",
        targetProp: "_trs",
        arrayIndex: 1,
        category: "transform",
        objectGetter: (node: cc.Node) => node
    },
    "position.y": {
        uiName: "Position Y",
        targetProp: "_trs",
        arrayIndex: 2,
        category: "transform",
        objectGetter: (node: cc.Node) => node
    },
    "position.z": {
        uiName: "Position Z",
        targetProp: "_trs",
        arrayIndex: 3,
        category: "transform",
        objectGetter: (node: cc.Node) => node
    },
    "rotation": {
        uiName: "Rotation",
        targetProp: "_eulerAngles",
        category: "transform"
    },
    "rotation.x": {
        uiName: "Rotation X",
        targetProp: "_eulerAngles",
        category: "transform",
        objectGetter: (node: cc.Node) => node
    },
    "rotation.y": {
        uiName: "Rotation Y",
        targetProp: "_eulerAngles",
        category: "transform",
        objectGetter: (node: cc.Node) => node
    },
    "rotation.z": {
        uiName: "Rotation Z",
        targetProp: "_eulerAngles",
        category: "transform",
        objectGetter: (node: cc.Node) => node
    },
    "scale": {
        uiName: "Scale",
        targetProp: "_scale",
        category: "transform"
    },
    "scale.x": {
        uiName: "Scale X",
        targetProp: "_scale",
        category: "transform",
        objectGetter: (node: cc.Node) => node
    },
    "scale.y": {
        uiName: "Scale Y",
        targetProp: "_scale",
        category: "transform",
        objectGetter: (node: cc.Node) => node
    },
    "scale.z": {
        uiName: "Scale Z",
        targetProp: "_scale",
        category: "transform",
        objectGetter: (node: cc.Node) => node
    },
    "opacity": {
        uiName: "Opacity",
        targetProp: "_opacity",
        category: "render"
    },
    "active": {
        uiName: "Active",
        targetProp: "_active",
        category: "node"
    },
    "name": {
        uiName: "Name",
        targetProp: "_name",
        category: "node"
    }
}; 