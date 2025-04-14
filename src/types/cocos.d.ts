declare namespace cc {
    interface Node {
        uuid: string;
        name: string;
        children: Node[];
        _components: Component[];
        getComponent<T extends Component>(type: { prototype: T }): T;
        getComponents<T extends Component>(type: { prototype: T }): T[];
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
} 