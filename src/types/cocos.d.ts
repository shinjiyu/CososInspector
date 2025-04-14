declare namespace cc {
    interface Node {
        uuid: string;
        name: string;
        children: Node[];
        _components: Component[];
        parent: Node | null;

        // 位置属性
        x: number;
        y: number;
        z?: number;
        position?: Vector3;

        // 旋转属性
        rotation?: number | Quaternion;
        angle?: number;
        eulerAngles?: Vector3;

        // 缩放属性
        scale?: number | Vector3;
        scaleX?: number;
        scaleY?: number;
        scaleZ?: number;

        // 节点属性
        width?: number;
        height?: number;
        opacity?: number;
        active: boolean;

        // 方法
        getComponent<T extends Component>(type: { prototype: T }): T;
        getComponents<T extends Component>(type: { prototype: T }): T[];
        getChildByName(name: string): Node | null;
        addChild(child: Node): void;
        removeChild(child: Node): void;
    }

    interface Component {
        node: Node;
        enabled: boolean;
        uuid: string;
        name: string;
    }

    interface Director {
        getScene(): Node;
    }

    const director: Director;

    // 数学类型
    class Vector2 {
        x: number;
        y: number;
        constructor(x?: number, y?: number);
    }

    class Vector3 {
        x: number;
        y: number;
        z: number;
        constructor(x?: number, y?: number, z?: number);
    }

    class Quaternion {
        x: number;
        y: number;
        z: number;
        w: number;
    }

    class Color {
        r: number;
        g: number;
        b: number;
        a: number;
        constructor(r?: number, g?: number, b?: number, a?: number);
    }
} 