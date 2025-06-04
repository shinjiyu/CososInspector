/**
 * 动画状态枚举
 */
export enum AnimationStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    PAUSED = 'paused',
    ERROR = 'error'
}

/**
 * 动画节点类型枚举
 */
export enum AnimationNodeType {
    SINGLE = 'single',
    SEQUENCE = 'sequence',
    PARALLEL = 'parallel'
}

/**
 * 动画连接类型枚举
 */
export enum AnimationEdgeType {
    SEQUENCE = 'sequence',
    TRIGGER = 'trigger',
    DEPENDENCY = 'dependency'
}

/**
 * 动画节点接口
 */
export interface AnimationNode {
    id: string;
    name: string;
    type: AnimationNodeType;
    duration: number;
    status: AnimationStatus;
    progress: number;
    startTime?: number;
    endTime?: number;
    params?: any;
    targetNodeId?: string;
    parentId?: string;
    childrenIds?: string[];
}

/**
 * 动画连接接口
 */
export interface AnimationEdge {
    id: string;
    source: string;
    target: string;
    type: AnimationEdgeType;
    delay?: number;
    condition?: string;
}

/**
 * 动画图接口
 */
export interface AnimationGraph {
    nodes: AnimationNode[];
    edges: AnimationEdge[];
    metadata?: {
        name?: string;
        description?: string;
        version?: string;
        createdAt?: number;
        updatedAt?: number;
    };
}

/**
 * 动画事件接口
 */
export interface AnimationEvent {
    type: 'start' | 'progress' | 'complete' | 'pause' | 'resume' | 'error';
    animationId: string;
    timestamp: number;
    data?: {
        progress?: number;
        error?: string;
        [key: string]: any;
    };
}

/**
 * 动画图配置接口
 */
export interface AnimationGraphConfig {
    enableRealTimeUpdate: boolean;
    updateInterval: number;
    showAnimationParams: boolean;
    showTimeInfo: boolean;
    layoutAlgorithm: 'dagre' | 'breadthfirst' | 'circle' | 'concentric' | 'grid';
}

/**
 * 动画控制器接口
 */
export interface AnimationController {
    play(animationId?: string): void;
    pause(animationId?: string): void;
    stop(animationId?: string): void;
    reset(animationId?: string): void;
    seek(progress: number, animationId?: string): void;
    getStatus(animationId: string): AnimationStatus;
    getProgress(animationId: string): number;
} 