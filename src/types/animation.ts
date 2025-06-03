// 动画状态图类型定义

/**
 * 动画节点状态枚举
 */
export enum AnimationStatus {
    PENDING = 'pending',     // 等待执行
    RUNNING = 'running',     // 正在执行
    COMPLETED = 'completed', // 已完成
    PAUSED = 'paused',      // 已暂停
    ERROR = 'error'         // 执行错误
}

/**
 * 动画节点类型枚举
 */
export enum AnimationNodeType {
    SINGLE = 'single',       // 单个动画
    SEQUENCE = 'sequence',   // 序列动画容器
    PARALLEL = 'parallel'    // 并行动画容器
}

/**
 * 动画连接类型枚举
 */
export enum AnimationEdgeType {
    SEQUENCE = 'sequence',   // 顺序执行
    TRIGGER = 'trigger',     // 触发关系
    DEPENDENCY = 'dependency' // 依赖关系
}

/**
 * 动画节点接口
 */
export interface AnimationNode {
    /** 唯一标识符 */
    id: string;
    /** 动画名称 */
    name: string;
    /** 动画类型 */
    type: AnimationNodeType;
    /** 动画持续时间（毫秒） */
    duration: number;
    /** 当前状态 */
    status: AnimationStatus;
    /** 执行进度 (0-1) */
    progress: number;
    /** 开始时间戳 */
    startTime?: number;
    /** 结束时间戳 */
    endTime?: number;
    /** 动画参数 */
    params?: Record<string, any>;
    /** 关联的Cocos节点UUID */
    targetNodeId?: string;
    /** 父动画ID（用于嵌套动画） */
    parentId?: string;
    /** 子动画ID列表 */
    childrenIds?: string[];
}

/**
 * 动画连接接口
 */
export interface AnimationEdge {
    /** 唯一标识符 */
    id: string;
    /** 源动画ID */
    source: string;
    /** 目标动画ID */
    target: string;
    /** 连接类型 */
    type: AnimationEdgeType;
    /** 延迟时间（毫秒） */
    delay?: number;
    /** 条件表达式 */
    condition?: string;
}

/**
 * 动画图结构接口
 */
export interface AnimationGraph {
    /** 动画节点列表 */
    nodes: AnimationNode[];
    /** 动画连接列表 */
    edges: AnimationEdge[];
    /** 图的元数据 */
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
    /** 事件类型 */
    type: 'start' | 'progress' | 'complete' | 'pause' | 'resume' | 'error';
    /** 动画ID */
    animationId: string;
    /** 时间戳 */
    timestamp: number;
    /** 事件数据 */
    data?: {
        progress?: number;
        error?: string;
        [key: string]: any;
    };
}

/**
 * 动画控制器接口
 */
export interface AnimationController {
    /** 播放动画 */
    play(animationId?: string): void;
    /** 暂停动画 */
    pause(animationId?: string): void;
    /** 停止动画 */
    stop(animationId?: string): void;
    /** 重置动画 */
    reset(animationId?: string): void;
    /** 跳转到指定进度 */
    seek(progress: number, animationId?: string): void;
    /** 获取动画状态 */
    getStatus(animationId: string): AnimationStatus;
    /** 获取动画进度 */
    getProgress(animationId: string): number;
}

/**
 * 动画状态图配置接口
 */
export interface AnimationGraphConfig {
    /** 是否启用实时更新 */
    enableRealTimeUpdate: boolean;
    /** 更新间隔（毫秒） */
    updateInterval: number;
    /** 是否显示动画参数 */
    showAnimationParams: boolean;
    /** 是否显示时间信息 */
    showTimeInfo: boolean;
    /** 图布局算法 */
    layoutAlgorithm: 'breadthfirst' | 'circle' | 'concentric' | 'grid' | 'dagre';
    /** 节点样式配置 */
    nodeStyle?: Record<string, any>;
    /** 边样式配置 */
    edgeStyle?: Record<string, any>;
} 