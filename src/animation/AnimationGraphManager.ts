import {
    AnimationController,
    AnimationEdge,
    AnimationEvent,
    AnimationGraph,
    AnimationGraphConfig,
    AnimationNode,
    AnimationStatus
} from '../types/animation';
import { logError, logInfo, logWarn } from '../utils/nodeLogger';

/**
 * 动画图管理器
 * 负责管理动画数据、事件处理和状态更新
 */
export class AnimationGraphManager implements AnimationController {
    private animationGraph: AnimationGraph;
    private eventListeners: Map<string, ((event: AnimationEvent) => void)[]>;
    private config: AnimationGraphConfig;
    private updateTimer: number | null = null;

    constructor(config?: Partial<AnimationGraphConfig>) {
        this.animationGraph = {
            nodes: [],
            edges: [],
            metadata: {
                name: 'Animation Graph',
                version: '1.0.0',
                createdAt: Date.now(),
                updatedAt: Date.now()
            }
        };

        this.eventListeners = new Map();
        this.config = {
            enableRealTimeUpdate: true,
            updateInterval: 100,
            showAnimationParams: true,
            showTimeInfo: true,
            layoutAlgorithm: 'dagre',
            ...config
        };

        this.initializeEventSystem();
        logInfo('[动画图管理器] 初始化完成');
    }

    /**
     * 初始化事件系统
     */
    private initializeEventSystem(): void {
        // 监听全局动画事件
        if (typeof window !== 'undefined') {
            window.addEventListener('cocosAnimationEvent', this.handleAnimationEvent.bind(this) as EventListener);
        }

        // 启动实时更新
        if (this.config.enableRealTimeUpdate) {
            this.startRealTimeUpdate();
        }
    }

    /**
     * 处理动画事件
     */
    private handleAnimationEvent(event: Event): void {
        const customEvent = event as CustomEvent<AnimationEvent>;
        const animationEvent = customEvent.detail;
        logInfo(`[动画事件] 收到事件: ${animationEvent.type}, 动画ID: ${animationEvent.animationId}`);

        // 更新动画节点状态
        this.updateAnimationStatus(animationEvent);

        // 触发事件监听器
        this.triggerEventListeners(animationEvent.type, animationEvent);
    }

    /**
     * 更新动画状态
     */
    private updateAnimationStatus(event: AnimationEvent): void {
        const node = this.getAnimationNode(event.animationId);
        if (!node) {
            logWarn(`[动画状态更新] 找不到动画节点: ${event.animationId}`);
            return;
        }

        switch (event.type) {
            case 'start':
                node.status = AnimationStatus.RUNNING;
                node.startTime = event.timestamp;
                node.progress = 0;
                break;
            case 'progress':
                if (event.data?.progress !== undefined) {
                    node.progress = Math.max(0, Math.min(1, event.data.progress));
                }
                break;
            case 'complete':
                node.status = AnimationStatus.COMPLETED;
                node.endTime = event.timestamp;
                node.progress = 1;
                break;
            case 'pause':
                node.status = AnimationStatus.PAUSED;
                break;
            case 'resume':
                node.status = AnimationStatus.RUNNING;
                break;
            case 'error':
                node.status = AnimationStatus.ERROR;
                if (event.data?.error) {
                    logError(`[动画错误] ${event.animationId}: ${event.data.error}`);
                }
                break;
        }

        // 更新图的修改时间
        if (this.animationGraph.metadata) {
            this.animationGraph.metadata.updatedAt = Date.now();
        }
    }

    /**
     * 启动实时更新
     */
    private startRealTimeUpdate(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
        }

        this.updateTimer = window.setInterval(() => {
            this.updateRunningAnimations();
        }, this.config.updateInterval);
    }

    /**
     * 停止实时更新
     */
    private stopRealTimeUpdate(): void {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }

    /**
     * 更新正在运行的动画
     */
    private updateRunningAnimations(): void {
        const runningNodes = this.animationGraph.nodes.filter(
            node => node.status === AnimationStatus.RUNNING
        );

        runningNodes.forEach(node => {
            if (node.startTime && node.duration > 0) {
                const elapsed = Date.now() - node.startTime;
                const progress = Math.min(1, elapsed / node.duration);

                if (progress !== node.progress) {
                    node.progress = progress;

                    // 触发进度事件
                    this.emitAnimationEvent({
                        type: 'progress',
                        animationId: node.id,
                        timestamp: Date.now(),
                        data: { progress }
                    });
                }

                // 检查是否完成
                if (progress >= 1) {
                    this.emitAnimationEvent({
                        type: 'complete',
                        animationId: node.id,
                        timestamp: Date.now()
                    });
                }
            }
        });
    }

    /**
     * 发射动画事件
     */
    private emitAnimationEvent(event: AnimationEvent): void {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('cocosAnimationEvent', { detail: event }));
        }
    }

    /**
     * 触发事件监听器
     */
    private triggerEventListeners(eventType: string, event: AnimationEvent): void {
        const listeners = this.eventListeners.get(eventType) || [];
        listeners.forEach(listener => {
            try {
                listener(event);
            } catch (error) {
                logError(`[事件监听器] 执行监听器时出错: ${eventType}`, error);
            }
        });
    }

    // ==================== 公共API ====================

    /**
     * 添加动画节点
     */
    addAnimationNode(node: AnimationNode): void {
        // 检查ID是否已存在
        if (this.getAnimationNode(node.id)) {
            logWarn(`[添加动画节点] 节点ID已存在: ${node.id}`);
            return;
        }

        this.animationGraph.nodes.push({ ...node });
        logInfo(`[添加动画节点] 添加节点: ${node.name}(${node.id})`);

        // 更新修改时间
        if (this.animationGraph.metadata) {
            this.animationGraph.metadata.updatedAt = Date.now();
        }
    }

    /**
     * 添加动画连接
     */
    addAnimationEdge(edge: AnimationEdge): void {
        // 检查源和目标节点是否存在
        if (!this.getAnimationNode(edge.source) || !this.getAnimationNode(edge.target)) {
            logWarn(`[添加动画连接] 源或目标节点不存在: ${edge.source} -> ${edge.target}`);
            return;
        }

        // 检查连接是否已存在
        if (this.animationGraph.edges.find(e => e.id === edge.id)) {
            logWarn(`[添加动画连接] 连接ID已存在: ${edge.id}`);
            return;
        }

        this.animationGraph.edges.push({ ...edge });
        logInfo(`[添加动画连接] 添加连接: ${edge.source} -> ${edge.target}`);
    }

    /**
     * 移除动画节点
     */
    removeAnimationNode(nodeId: string): void {
        const index = this.animationGraph.nodes.findIndex(node => node.id === nodeId);
        if (index === -1) {
            logWarn(`[移除动画节点] 节点不存在: ${nodeId}`);
            return;
        }

        // 移除相关的连接
        this.animationGraph.edges = this.animationGraph.edges.filter(
            edge => edge.source !== nodeId && edge.target !== nodeId
        );

        // 移除节点
        this.animationGraph.nodes.splice(index, 1);
        logInfo(`[移除动画节点] 移除节点: ${nodeId}`);
    }

    /**
     * 移除动画连接
     */
    removeAnimationEdge(edgeId: string): void {
        const index = this.animationGraph.edges.findIndex(edge => edge.id === edgeId);
        if (index === -1) {
            logWarn(`[移除动画连接] 连接不存在: ${edgeId}`);
            return;
        }

        this.animationGraph.edges.splice(index, 1);
        logInfo(`[移除动画连接] 移除连接: ${edgeId}`);
    }

    /**
     * 获取动画节点
     */
    getAnimationNode(nodeId: string): AnimationNode | undefined {
        return this.animationGraph.nodes.find(node => node.id === nodeId);
    }

    /**
     * 获取动画图
     */
    getAnimationGraph(): AnimationGraph {
        return { ...this.animationGraph };
    }

    /**
     * 设置动画图
     */
    setAnimationGraph(graph: AnimationGraph): void {
        this.animationGraph = { ...graph };
        logInfo(`[设置动画图] 加载图: ${graph.nodes.length} 个节点, ${graph.edges.length} 个连接`);
    }

    /**
     * 清空动画图
     */
    clearAnimationGraph(): void {
        this.animationGraph.nodes = [];
        this.animationGraph.edges = [];
        logInfo('[清空动画图] 动画图已清空');
    }

    /**
     * 添加事件监听器
     */
    addEventListener(eventType: string, listener: (event: AnimationEvent) => void): void {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, []);
        }
        this.eventListeners.get(eventType)!.push(listener);
    }

    /**
     * 移除事件监听器
     */
    removeEventListener(eventType: string, listener: (event: AnimationEvent) => void): void {
        const listeners = this.eventListeners.get(eventType);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * 更新配置
     */
    updateConfig(newConfig: Partial<AnimationGraphConfig>): void {
        this.config = { ...this.config, ...newConfig };

        // 重启实时更新（如果配置改变）
        if (newConfig.enableRealTimeUpdate !== undefined || newConfig.updateInterval !== undefined) {
            this.stopRealTimeUpdate();
            if (this.config.enableRealTimeUpdate) {
                this.startRealTimeUpdate();
            }
        }
    }

    /**
     * 获取配置
     */
    getConfig(): AnimationGraphConfig {
        return { ...this.config };
    }

    // ==================== AnimationController 接口实现 ====================

    play(animationId?: string): void {
        if (animationId) {
            const node = this.getAnimationNode(animationId);
            if (node) {
                this.emitAnimationEvent({
                    type: 'start',
                    animationId,
                    timestamp: Date.now()
                });
            }
        } else {
            // 播放所有动画
            this.animationGraph.nodes.forEach(node => {
                if (node.status === AnimationStatus.PENDING || node.status === AnimationStatus.PAUSED) {
                    this.play(node.id);
                }
            });
        }
    }

    pause(animationId?: string): void {
        if (animationId) {
            const node = this.getAnimationNode(animationId);
            if (node && node.status === AnimationStatus.RUNNING) {
                this.emitAnimationEvent({
                    type: 'pause',
                    animationId,
                    timestamp: Date.now()
                });
            }
        } else {
            // 暂停所有运行中的动画
            this.animationGraph.nodes.forEach(node => {
                if (node.status === AnimationStatus.RUNNING) {
                    this.pause(node.id);
                }
            });
        }
    }

    stop(animationId?: string): void {
        if (animationId) {
            const node = this.getAnimationNode(animationId);
            if (node) {
                node.status = AnimationStatus.PENDING;
                node.progress = 0;
                node.startTime = undefined;
                node.endTime = undefined;
            }
        } else {
            // 停止所有动画
            this.animationGraph.nodes.forEach(node => {
                this.stop(node.id);
            });
        }
    }

    reset(animationId?: string): void {
        this.stop(animationId);
    }

    seek(progress: number, animationId?: string): void {
        progress = Math.max(0, Math.min(1, progress));

        if (animationId) {
            const node = this.getAnimationNode(animationId);
            if (node) {
                node.progress = progress;
                this.emitAnimationEvent({
                    type: 'progress',
                    animationId,
                    timestamp: Date.now(),
                    data: { progress }
                });
            }
        }
    }

    getStatus(animationId: string): AnimationStatus {
        const node = this.getAnimationNode(animationId);
        return node ? node.status : AnimationStatus.PENDING;
    }

    getProgress(animationId: string): number {
        const node = this.getAnimationNode(animationId);
        return node ? node.progress : 0;
    }

    /**
     * 销毁管理器
     */
    destroy(): void {
        this.stopRealTimeUpdate();
        this.eventListeners.clear();

        if (typeof window !== 'undefined') {
            window.removeEventListener('cocosAnimationEvent', this.handleAnimationEvent.bind(this) as EventListener);
        }

        logInfo('[动画图管理器] 已销毁');
    }
} 