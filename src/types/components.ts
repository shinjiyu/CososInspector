// 组件渲染器接口
export interface ComponentRenderer {
    // 判断是否可以渲染指定组件
    canRender(component: cc.Component): boolean;

    // 渲染组件并返回HTML
    render(component: cc.Component): string;
}

// 组件属性类型枚举
export enum PropertyType {
    String = 'string',
    Number = 'number',
    Boolean = 'boolean',
    Vector2 = 'vector2',
    Vector3 = 'vector3',
    Color = 'color',
    Select = 'select',
    Node = 'node',
    Asset = 'asset',
    Custom = 'custom'
}

// 组件属性描述
export interface PropertyDescriptor {
    name: string;
    type: PropertyType;
    label?: string;
    tooltip?: string;
    group?: string;
    options?: Array<{ label: string, value: any }>;  // 用于Select类型
    readOnly?: boolean;
    min?: number;
    max?: number;
}

// 组件组描述
export interface GroupDescriptor {
    name: string;
    label: string;
    collapsed?: boolean;
}

// 组件描述
export interface ComponentDescriptor {
    name: string;
    properties: PropertyDescriptor[];
    groups?: GroupDescriptor[];
} 