import cytoscape, { Core, EdgeSingular, NodeSingular } from 'cytoscape';
// @ts-ignore
import dagre from 'cytoscape-dagre';
import {
    AnimationGraph,
    AnimationGraphConfig
} from '../types/animation';
import { logInfo } from '../utils/nodeLogger';
import { AnimationGraphManager } from './AnimationGraphManager';

// 注册 dagre 布局
cytoscape.use(dagre);

/**
 * 动画图渲染器
 * 使用 Cytoscape.js 渲染动画状态图
 */
export class AnimationGraphRenderer {
    private container: HTMLElement;
    private cy: Core | null = null;
    private manager: AnimationGraphManager;
    private config: AnimationGraphConfig;
    private selectedNode: string | null = null;

    constructor(container: HTMLElement, manager: AnimationGraphManager) {
        this.container = container;
        this.manager = manager;
        this.config = manager.getConfig();

        this.initializeCytoscape();
        this.setupEventListeners();

        logInfo('[动画图渲染器] 初始化完成');
    }

    /**
     * 初始化 Cytoscape
     */
    private initializeCytoscape(): void {
        this.cy = cytoscape({
            container: this.container,

            style: [
                // 节点样式
                {
                    selector: 'node',
                    style: {
                        'background-color': '#666',
                        'label': 'data(name)',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'color': '#fff',
                        'font-size': '12px',
                        'width': '80px',
                        'height': '40px',
                        'shape': 'roundrectangle',
                        'border-width': 2,
                        'border-color': '#333'
                    }
                },

                // 不同状态的节点样式
                {
                    selector: 'node[status="pending"]',
                    style: {
                        'background-color': '#95a5a6',
                        'border-color': '#7f8c8d'
                    }
                },
                {
                    selector: 'node[status="running"]',
                    style: {
                        'background-color': '#3498db',
                        'border-color': '#2980b9'
                    }
                },
                {
                    selector: 'node[status="completed"]',
                    style: {
                        'background-color': '#27ae60',
                        'border-color': '#229954'
                    }
                },
                {
                    selector: 'node[status="paused"]',
                    style: {
                        'background-color': '#f39c12',
                        'border-color': '#e67e22'
                    }
                },
                {
                    selector: 'node[status="error"]',
                    style: {
                        'background-color': '#e74c3c',
                        'border-color': '#c0392b'
                    }
                },

                // 不同类型的节点样式
                {
                    selector: 'node[type="sequence"]',
                    style: {
                        'shape': 'rectangle'
                    }
                },
                {
                    selector: 'node[type="parallel"]',
                    style: {
                        'shape': 'diamond'
                    }
                },

                // 选中节点样式
                {
                    selector: 'node:selected',
                    style: {
                        'border-width': 4,
                        'border-color': '#fff'
                    }
                },

                // 边样式
                {
                    selector: 'edge',
                    style: {
                        'width': 2,
                        'line-color': '#666',
                        'target-arrow-color': '#666',
                        'target-arrow-shape': 'triangle',
                        'curve-style': 'bezier',
                        'arrow-scale': 1.2
                    }
                },

                // 不同类型的边样式
                {
                    selector: 'edge[type="sequence"]',
                    style: {
                        'line-color': '#3498db',
                        'target-arrow-color': '#3498db',
                        'line-style': 'solid'
                    }
                },
                {
                    selector: 'edge[type="trigger"]',
                    style: {
                        'line-color': '#e74c3c',
                        'target-arrow-color': '#e74c3c',
                        'line-style': 'dashed'
                    }
                },
                {
                    selector: 'edge[type="dependency"]',
                    style: {
                        'line-color': '#f39c12',
                        'target-arrow-color': '#f39c12',
                        'line-style': 'dotted'
                    }
                }
            ],

            layout: {
                name: this.config.layoutAlgorithm,
                directed: true,
                padding: 20,
                spacingFactor: 1.5
            },

            // 启用平移和缩放
            zoomingEnabled: true,
            userZoomingEnabled: true,
            panningEnabled: true,
            userPanningEnabled: true,

            // 禁用选择框
            boxSelectionEnabled: false,

            // 最小和最大缩放
            minZoom: 0.1,
            maxZoom: 3
        });

        // 添加进度指示器
        this.addProgressIndicators();
    }

    /**
     * 添加进度指示器
     */
    private addProgressIndicators(): void {
        if (!this.cy) return;

        // 为每个节点添加进度条
        this.cy.on('add', 'node', (event) => {
            const node = event.target as NodeSingular;
            this.updateNodeProgress(node);
        });
    }

    /**
     * 更新节点进度显示
     */
    private updateNodeProgress(node: NodeSingular): void {
        const progress = node.data('progress') || 0;
        const status = node.data('status');

        // 根据进度更新节点的视觉效果
        if (status === 'running' && progress > 0) {
            // 添加进度条效果
            const progressWidth = 80 * progress; // 节点宽度 * 进度
            node.style({
                'background-gradient-stop-colors': `#3498db #3498db`,
                'background-gradient-stop-positions': `0% ${progress * 100}%`,
                'background-gradient-direction': 'to-right'
            });
        }
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        if (!this.cy) return;

        // 节点点击事件
        this.cy.on('tap', 'node', (event) => {
            const node = event.target as NodeSingular;
            const nodeId = node.id();
            this.selectNode(nodeId);
        });

        // 边点击事件
        this.cy.on('tap', 'edge', (event) => {
            const edge = event.target as EdgeSingular;
            const edgeId = edge.id();
            this.selectEdge(edgeId);
        });

        // 背景点击事件（取消选择）
        this.cy.on('tap', (event) => {
            if (event.target === this.cy) {
                this.clearSelection();
            }
        });

        // 监听动画事件
        this.manager.addEventListener('start', this.handleAnimationEvent.bind(this));
        this.manager.addEventListener('progress', this.handleAnimationEvent.bind(this));
        this.manager.addEventListener('complete', this.handleAnimationEvent.bind(this));
        this.manager.addEventListener('pause', this.handleAnimationEvent.bind(this));
        this.manager.addEventListener('resume', this.handleAnimationEvent.bind(this));
        this.manager.addEventListener('error', this.handleAnimationEvent.bind(this));
    }

    /**
     * 处理动画事件
     */
    private handleAnimationEvent(event: any): void {
        if (!this.cy) return;

        const nodeId = event.animationId;
        const node = this.cy.getElementById(nodeId);

        if (node.length > 0) {
            // 更新节点数据
            const animationNode = this.manager.getAnimationNode(nodeId);
            if (animationNode) {
                node.data('status', animationNode.status);
                node.data('progress', animationNode.progress);

                // 更新进度显示
                this.updateNodeProgress(node);

                // 触发视觉效果
                this.triggerNodeAnimation(node, event.type);
            }
        }
    }

    /**
     * 触发节点动画效果
     */
    private triggerNodeAnimation(node: NodeSingular, eventType: string): void {
        switch (eventType) {
            case 'start':
                // 开始动画：闪烁效果
                node.animate({
                    style: { 'border-width': 6 }
                }, {
                    duration: 200,
                    complete: () => {
                        node.animate({
                            style: { 'border-width': 2 }
                        }, { duration: 200 });
                    }
                });
                break;

            case 'complete':
                // 完成动画：缩放效果
                node.animate({
                    style: { 'width': 90, 'height': 45 }
                }, {
                    duration: 300,
                    complete: () => {
                        node.animate({
                            style: { 'width': 80, 'height': 40 }
                        }, { duration: 300 });
                    }
                });
                break;

            case 'error':
                // 错误动画：震动效果
                const originalPosition = node.position();
                node.animate({
                    position: { x: originalPosition.x + 5, y: originalPosition.y }
                }, {
                    duration: 100,
                    complete: () => {
                        node.animate({
                            position: { x: originalPosition.x - 5, y: originalPosition.y }
                        }, {
                            duration: 100,
                            complete: () => {
                                node.animate({
                                    position: originalPosition
                                }, { duration: 100 });
                            }
                        });
                    }
                });
                break;
        }
    }

    /**
     * 选择节点
     */
    private selectNode(nodeId: string): void {
        if (!this.cy) return;

        this.selectedNode = nodeId;

        // 清除之前的选择
        this.cy.elements().unselect();

        // 选择新节点
        const node = this.cy.getElementById(nodeId);
        node.select();

        // 触发选择事件
        this.onNodeSelected(nodeId);

        logInfo(`[动画图渲染器] 选择节点: ${nodeId}`);
    }

    /**
     * 选择边
     */
    private selectEdge(edgeId: string): void {
        if (!this.cy) return;

        // 清除之前的选择
        this.cy.elements().unselect();

        // 选择新边
        const edge = this.cy.getElementById(edgeId);
        edge.select();

        // 触发选择事件
        this.onEdgeSelected(edgeId);

        logInfo(`[动画图渲染器] 选择边: ${edgeId}`);
    }

    /**
     * 清除选择
     */
    private clearSelection(): void {
        if (!this.cy) return;

        this.selectedNode = null;
        this.cy.elements().unselect();
        this.onSelectionCleared();
    }

    /**
     * 渲染动画图
     */
    public renderGraph(graph: AnimationGraph): void {
        if (!this.cy) return;

        logInfo(`[动画图渲染器] 开始渲染图: ${graph.nodes.length} 个节点, ${graph.edges.length} 个边`);

        // 清空现有元素
        this.cy.elements().remove();

        // 添加节点
        graph.nodes.forEach(node => {
            this.cy!.add({
                group: 'nodes',
                data: {
                    id: node.id,
                    name: node.name,
                    type: node.type,
                    status: node.status,
                    progress: node.progress,
                    duration: node.duration,
                    startTime: node.startTime,
                    endTime: node.endTime,
                    params: node.params,
                    targetNodeId: node.targetNodeId,
                    parentId: node.parentId,
                    childrenIds: node.childrenIds
                }
            });
        });

        // 添加边
        graph.edges.forEach(edge => {
            this.cy!.add({
                group: 'edges',
                data: {
                    id: edge.id,
                    source: edge.source,
                    target: edge.target,
                    type: edge.type,
                    delay: edge.delay,
                    condition: edge.condition
                }
            });
        });

        // 重新布局
        this.relayout();

        logInfo('[动画图渲染器] 图渲染完成');
    }

    /**
     * 重新布局
     */
    public relayout(): void {
        if (!this.cy) return;

        const layout = this.cy.layout({
            name: this.config.layoutAlgorithm,
            directed: true,
            padding: 20,
            spacingFactor: 1.5
        });

        layout.run();
    }

    /**
     * 更新配置
     */
    public updateConfig(newConfig: Partial<AnimationGraphConfig>): void {
        this.config = { ...this.config, ...newConfig };

        // 如果布局算法改变，重新布局
        if (newConfig.layoutAlgorithm) {
            this.relayout();
        }
    }

    /**
     * 适应视图
     */
    public fit(): void {
        if (!this.cy) return;
        this.cy.fit();
    }

    /**
     * 居中视图
     */
    public center(): void {
        if (!this.cy) return;
        this.cy.center();
    }

    /**
     * 重置缩放
     */
    public resetZoom(): void {
        if (!this.cy) return;
        this.cy.zoom(1);
        this.cy.center();
    }

    /**
     * 获取选中的节点ID
     */
    public getSelectedNode(): string | null {
        return this.selectedNode;
    }

    /**
     * 导出图片
     */
    public exportImage(format: 'png' | 'jpg' = 'png'): string {
        if (!this.cy) return '';

        return this.cy.png({
            output: 'base64uri',
            bg: '#ffffff',
            full: true
        });
    }

    /**
     * 销毁渲染器
     */
    public destroy(): void {
        if (this.cy) {
            this.cy.destroy();
            this.cy = null;
        }
        logInfo('[动画图渲染器] 已销毁');
    }

    // ==================== 事件回调 ====================

    /**
     * 节点选择回调（可被重写）
     */
    protected onNodeSelected(nodeId: string): void {
        // 子类可以重写此方法
    }

    /**
     * 边选择回调（可被重写）
     */
    protected onEdgeSelected(edgeId: string): void {
        // 子类可以重写此方法
    }

    /**
     * 选择清除回调（可被重写）
     */
    protected onSelectionCleared(): void {
        // 子类可以重写此方法
    }
} 