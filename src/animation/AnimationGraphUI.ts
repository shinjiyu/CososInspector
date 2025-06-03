import {
    AnimationEdgeType,
    AnimationNodeType,
    AnimationStatus
} from '../types/animation';
import { logError, logInfo } from '../utils/nodeLogger';
import { AnimationGraphManager } from './AnimationGraphManager';
import { AnimationGraphRenderer } from './AnimationGraphRenderer';

/**
 * 动画状态图UI组件
 * 提供完整的动画状态图界面
 */
export class AnimationGraphUI {
    private container: HTMLElement;
    private manager: AnimationGraphManager;
    private renderer: AnimationGraphRenderer | null = null;
    private detailsPanel: HTMLElement | null = null;
    private controlPanel: HTMLElement | null = null;
    private graphContainer: HTMLElement | null = null;

    constructor(container: HTMLElement) {
        this.container = container;
        this.manager = new AnimationGraphManager();

        this.createUI();
        this.setupEventListeners();

        logInfo('[动画状态图UI] 初始化完成');
    }

    /**
     * 创建UI界面
     */
    private createUI(): void {
        this.container.innerHTML = '';
        this.container.className = 'animation-graph-ui';

        // 创建主布局
        const mainLayout = document.createElement('div');
        mainLayout.className = 'animation-graph-layout';

        // 创建工具栏
        const toolbar = this.createToolbar();
        mainLayout.appendChild(toolbar);

        // 创建内容区域
        const contentArea = document.createElement('div');
        contentArea.className = 'animation-graph-content';

        // 创建图形视图容器
        this.graphContainer = document.createElement('div');
        this.graphContainer.className = 'animation-graph-view';
        contentArea.appendChild(this.graphContainer);

        // 创建详情面板
        this.detailsPanel = this.createDetailsPanel();
        contentArea.appendChild(this.detailsPanel);

        mainLayout.appendChild(contentArea);

        // 创建控制面板
        this.controlPanel = this.createControlPanel();
        mainLayout.appendChild(this.controlPanel);

        this.container.appendChild(mainLayout);

        // 初始化渲染器
        this.initializeRenderer();

        // 添加CSS样式
        this.addStyles();
    }

    /**
     * 创建工具栏
     */
    private createToolbar(): HTMLElement {
        const toolbar = document.createElement('div');
        toolbar.className = 'animation-graph-toolbar';

        // 文件操作按钮
        const fileGroup = document.createElement('div');
        fileGroup.className = 'toolbar-group';

        const loadBtn = document.createElement('button');
        loadBtn.textContent = '加载';
        loadBtn.className = 'toolbar-btn';
        loadBtn.addEventListener('click', () => this.loadGraph());

        const saveBtn = document.createElement('button');
        saveBtn.textContent = '保存';
        saveBtn.className = 'toolbar-btn';
        saveBtn.addEventListener('click', () => this.saveGraph());

        const clearBtn = document.createElement('button');
        clearBtn.textContent = '清空';
        clearBtn.className = 'toolbar-btn';
        clearBtn.addEventListener('click', () => this.clearGraph());

        // 添加演示按钮
        const demoBtn = document.createElement('button');
        demoBtn.textContent = '演示';
        demoBtn.className = 'toolbar-btn demo-btn';
        demoBtn.title = '加载演示动画数据';
        demoBtn.addEventListener('click', () => this.loadDemoData());

        fileGroup.appendChild(loadBtn);
        fileGroup.appendChild(saveBtn);
        fileGroup.appendChild(clearBtn);
        fileGroup.appendChild(demoBtn);

        // 视图操作按钮
        const viewGroup = document.createElement('div');
        viewGroup.className = 'toolbar-group';

        const fitBtn = document.createElement('button');
        fitBtn.textContent = '适应';
        fitBtn.className = 'toolbar-btn';
        fitBtn.addEventListener('click', () => this.renderer?.fit());

        const centerBtn = document.createElement('button');
        centerBtn.textContent = '居中';
        centerBtn.className = 'toolbar-btn';
        centerBtn.addEventListener('click', () => this.renderer?.center());

        const resetZoomBtn = document.createElement('button');
        resetZoomBtn.textContent = '重置缩放';
        resetZoomBtn.className = 'toolbar-btn';
        resetZoomBtn.addEventListener('click', () => this.renderer?.resetZoom());

        viewGroup.appendChild(fitBtn);
        viewGroup.appendChild(centerBtn);
        viewGroup.appendChild(resetZoomBtn);

        // 布局选择
        const layoutGroup = document.createElement('div');
        layoutGroup.className = 'toolbar-group';

        const layoutLabel = document.createElement('label');
        layoutLabel.textContent = '布局:';
        layoutLabel.className = 'toolbar-label';

        const layoutSelect = document.createElement('select');
        layoutSelect.className = 'toolbar-select';
        layoutSelect.innerHTML = `
            <option value="dagre">Dagre</option>
            <option value="breadthfirst">广度优先</option>
            <option value="circle">圆形</option>
            <option value="concentric">同心圆</option>
            <option value="grid">网格</option>
        `;
        layoutSelect.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            this.updateLayout(target.value as any);
        });

        layoutGroup.appendChild(layoutLabel);
        layoutGroup.appendChild(layoutSelect);

        // 导出按钮
        const exportGroup = document.createElement('div');
        exportGroup.className = 'toolbar-group';

        const exportBtn = document.createElement('button');
        exportBtn.textContent = '导出图片';
        exportBtn.className = 'toolbar-btn';
        exportBtn.addEventListener('click', () => this.exportImage());

        exportGroup.appendChild(exportBtn);

        toolbar.appendChild(fileGroup);
        toolbar.appendChild(viewGroup);
        toolbar.appendChild(layoutGroup);
        toolbar.appendChild(exportGroup);

        return toolbar;
    }

    /**
     * 创建详情面板
     */
    private createDetailsPanel(): HTMLElement {
        const panel = document.createElement('div');
        panel.className = 'animation-details-panel';

        const header = document.createElement('div');
        header.className = 'details-header';
        header.innerHTML = '<h4>动画详情</h4>';

        const content = document.createElement('div');
        content.className = 'details-content';
        content.innerHTML = '<div class="no-selection">请选择一个动画节点</div>';

        panel.appendChild(header);
        panel.appendChild(content);

        return panel;
    }

    /**
     * 创建控制面板
     */
    private createControlPanel(): HTMLElement {
        const panel = document.createElement('div');
        panel.className = 'animation-control-panel';

        // 播放控制按钮
        const playBtn = document.createElement('button');
        playBtn.textContent = '▶ 播放';
        playBtn.className = 'control-btn play-btn';
        playBtn.addEventListener('click', () => this.manager.play());

        const pauseBtn = document.createElement('button');
        pauseBtn.textContent = '⏸ 暂停';
        pauseBtn.className = 'control-btn pause-btn';
        pauseBtn.addEventListener('click', () => this.manager.pause());

        const stopBtn = document.createElement('button');
        stopBtn.textContent = '⏹ 停止';
        stopBtn.className = 'control-btn stop-btn';
        stopBtn.addEventListener('click', () => this.manager.stop());

        const resetBtn = document.createElement('button');
        resetBtn.textContent = '🔄 重置';
        resetBtn.className = 'control-btn reset-btn';
        resetBtn.addEventListener('click', () => this.manager.reset());

        // 进度条
        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-container';

        const progressLabel = document.createElement('label');
        progressLabel.textContent = '总进度:';
        progressLabel.className = 'progress-label';

        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';

        const progressFill = document.createElement('div');
        progressFill.className = 'progress-fill';
        progressBar.appendChild(progressFill);

        const progressText = document.createElement('span');
        progressText.className = 'progress-text';
        progressText.textContent = '0%';

        progressContainer.appendChild(progressLabel);
        progressContainer.appendChild(progressBar);
        progressContainer.appendChild(progressText);

        // 状态信息
        const statusContainer = document.createElement('div');
        statusContainer.className = 'status-container';

        const statusLabel = document.createElement('label');
        statusLabel.textContent = '状态:';
        statusLabel.className = 'status-label';

        const statusText = document.createElement('span');
        statusText.className = 'status-text';
        statusText.textContent = '就绪';

        statusContainer.appendChild(statusLabel);
        statusContainer.appendChild(statusText);

        panel.appendChild(playBtn);
        panel.appendChild(pauseBtn);
        panel.appendChild(stopBtn);
        panel.appendChild(resetBtn);
        panel.appendChild(progressContainer);
        panel.appendChild(statusContainer);

        return panel;
    }

    /**
     * 初始化渲染器
     */
    private initializeRenderer(): void {
        if (!this.graphContainer) return;

        // 创建自定义渲染器类
        class CustomRenderer extends AnimationGraphRenderer {
            private ui: AnimationGraphUI;

            constructor(container: HTMLElement, manager: AnimationGraphManager, ui: AnimationGraphUI) {
                super(container, manager);
                this.ui = ui;
            }

            protected onNodeSelected(nodeId: string): void {
                this.ui.showNodeDetails(nodeId);
            }

            protected onEdgeSelected(edgeId: string): void {
                this.ui.showEdgeDetails(edgeId);
            }

            protected onSelectionCleared(): void {
                this.ui.clearDetails();
            }
        }

        this.renderer = new CustomRenderer(this.graphContainer, this.manager, this);
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        // 监听动画事件
        this.manager.addEventListener('start', () => this.updateControlPanel());
        this.manager.addEventListener('progress', () => this.updateControlPanel());
        this.manager.addEventListener('complete', () => this.updateControlPanel());
        this.manager.addEventListener('pause', () => this.updateControlPanel());
        this.manager.addEventListener('resume', () => this.updateControlPanel());
        this.manager.addEventListener('error', () => this.updateControlPanel());
    }

    /**
     * 显示节点详情
     */
    public showNodeDetails(nodeId: string): void {
        const node = this.manager.getAnimationNode(nodeId);
        if (!node || !this.detailsPanel) return;

        const content = this.detailsPanel.querySelector('.details-content');
        if (!content) return;

        content.innerHTML = `
            <div class="node-details">
                <div class="detail-item">
                    <label>ID:</label>
                    <span>${node.id}</span>
                </div>
                <div class="detail-item">
                    <label>名称:</label>
                    <span>${node.name}</span>
                </div>
                <div class="detail-item">
                    <label>类型:</label>
                    <span>${this.getNodeTypeText(node.type)}</span>
                </div>
                <div class="detail-item">
                    <label>状态:</label>
                    <span class="status-${node.status}">${this.getStatusText(node.status)}</span>
                </div>
                <div class="detail-item">
                    <label>进度:</label>
                    <span>${(node.progress * 100).toFixed(1)}%</span>
                </div>
                <div class="detail-item">
                    <label>持续时间:</label>
                    <span>${node.duration}ms</span>
                </div>
                ${node.targetNodeId ? `
                <div class="detail-item">
                    <label>目标节点:</label>
                    <span>${node.targetNodeId}</span>
                </div>
                ` : ''}
                ${node.params ? `
                <div class="detail-item">
                    <label>参数:</label>
                    <pre>${JSON.stringify(node.params, null, 2)}</pre>
                </div>
                ` : ''}
                <div class="detail-actions">
                    <button onclick="window.animationGraphUI.playAnimation('${node.id}')">播放</button>
                    <button onclick="window.animationGraphUI.pauseAnimation('${node.id}')">暂停</button>
                    <button onclick="window.animationGraphUI.stopAnimation('${node.id}')">停止</button>
                </div>
            </div>
        `;

        // 临时设置全局引用（用于按钮点击）
        (window as any).animationGraphUI = this;
    }

    /**
     * 显示边详情
     */
    public showEdgeDetails(edgeId: string): void {
        const graph = this.manager.getAnimationGraph();
        const edge = graph.edges.find(e => e.id === edgeId);
        if (!edge || !this.detailsPanel) return;

        const content = this.detailsPanel.querySelector('.details-content');
        if (!content) return;

        content.innerHTML = `
            <div class="edge-details">
                <div class="detail-item">
                    <label>ID:</label>
                    <span>${edge.id}</span>
                </div>
                <div class="detail-item">
                    <label>源节点:</label>
                    <span>${edge.source}</span>
                </div>
                <div class="detail-item">
                    <label>目标节点:</label>
                    <span>${edge.target}</span>
                </div>
                <div class="detail-item">
                    <label>类型:</label>
                    <span>${this.getEdgeTypeText(edge.type)}</span>
                </div>
                ${edge.delay ? `
                <div class="detail-item">
                    <label>延迟:</label>
                    <span>${edge.delay}ms</span>
                </div>
                ` : ''}
                ${edge.condition ? `
                <div class="detail-item">
                    <label>条件:</label>
                    <span>${edge.condition}</span>
                </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * 清除详情显示
     */
    public clearDetails(): void {
        if (!this.detailsPanel) return;

        const content = this.detailsPanel.querySelector('.details-content');
        if (content) {
            content.innerHTML = '<div class="no-selection">请选择一个动画节点或连接</div>';
        }
    }

    /**
     * 更新控制面板
     */
    private updateControlPanel(): void {
        if (!this.controlPanel) return;

        const graph = this.manager.getAnimationGraph();
        const runningNodes = graph.nodes.filter(node => node.status === AnimationStatus.RUNNING);
        const completedNodes = graph.nodes.filter(node => node.status === AnimationStatus.COMPLETED);

        // 计算总进度
        let totalProgress = 0;
        if (graph.nodes.length > 0) {
            totalProgress = graph.nodes.reduce((sum, node) => sum + node.progress, 0) / graph.nodes.length;
        }

        // 更新进度条
        const progressFill = this.controlPanel.querySelector('.progress-fill') as HTMLElement;
        const progressText = this.controlPanel.querySelector('.progress-text') as HTMLElement;
        if (progressFill && progressText) {
            progressFill.style.width = `${totalProgress * 100}%`;
            progressText.textContent = `${(totalProgress * 100).toFixed(1)}%`;
        }

        // 更新状态文本
        const statusText = this.controlPanel.querySelector('.status-text') as HTMLElement;
        if (statusText) {
            if (runningNodes.length > 0) {
                statusText.textContent = `运行中 (${runningNodes.length}/${graph.nodes.length})`;
            } else if (completedNodes.length === graph.nodes.length && graph.nodes.length > 0) {
                statusText.textContent = '已完成';
            } else {
                statusText.textContent = '就绪';
            }
        }
    }

    /**
     * 添加样式
     */
    private addStyles(): void {
        const style = document.createElement('style');
        style.textContent = `
            .animation-graph-ui {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                background: #1e1e1e;
                color: #fff;
            }

            .animation-graph-layout {
                display: flex;
                flex-direction: column;
                height: 100%;
            }

            .animation-graph-toolbar {
                display: flex;
                align-items: center;
                padding: 8px;
                background: #2d2d2d;
                border-bottom: 1px solid #444;
                gap: 16px;
            }

            .toolbar-group {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .toolbar-btn {
                padding: 4px 8px;
                background: #3d3d3d;
                border: 1px solid #555;
                color: #fff;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
            }

            .toolbar-btn:hover {
                background: #4d4d4d;
            }

            .toolbar-btn.demo-btn {
                background: #27ae60;
                color: white;
            }

            .toolbar-btn.demo-btn:hover {
                background: #229954;
            }

            .toolbar-label {
                font-size: 12px;
                color: #ccc;
            }

            .toolbar-select {
                padding: 2px 4px;
                background: #3d3d3d;
                border: 1px solid #555;
                color: #fff;
                border-radius: 3px;
                font-size: 12px;
            }

            .animation-graph-content {
                display: flex;
                flex: 1;
                overflow: hidden;
            }

            .animation-graph-view {
                flex: 1;
                background: #2a2a2a;
                border-right: 1px solid #444;
            }

            .animation-details-panel {
                width: 300px;
                background: #1e1e1e;
                border-left: 1px solid #444;
                display: flex;
                flex-direction: column;
            }

            .details-header {
                padding: 12px;
                background: #2d2d2d;
                border-bottom: 1px solid #444;
            }

            .details-header h4 {
                margin: 0;
                font-size: 14px;
                color: #fff;
            }

            .details-content {
                flex: 1;
                padding: 12px;
                overflow-y: auto;
            }

            .no-selection {
                color: #888;
                font-style: italic;
                text-align: center;
                margin-top: 20px;
            }

            .node-details, .edge-details {
                font-size: 12px;
            }

            .detail-item {
                margin-bottom: 8px;
                display: flex;
                flex-direction: column;
            }

            .detail-item label {
                font-weight: bold;
                color: #ccc;
                margin-bottom: 2px;
            }

            .detail-item span {
                color: #fff;
            }

            .detail-item pre {
                background: #2a2a2a;
                padding: 8px;
                border-radius: 3px;
                font-size: 11px;
                overflow-x: auto;
            }

            .status-pending { color: #95a5a6; }
            .status-running { color: #3498db; }
            .status-completed { color: #27ae60; }
            .status-paused { color: #f39c12; }
            .status-error { color: #e74c3c; }

            .detail-actions {
                margin-top: 12px;
                display: flex;
                gap: 4px;
            }

            .detail-actions button {
                padding: 4px 8px;
                background: #3498db;
                border: none;
                color: #fff;
                border-radius: 3px;
                cursor: pointer;
                font-size: 11px;
            }

            .detail-actions button:hover {
                background: #2980b9;
            }

            .animation-control-panel {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                background: #2d2d2d;
                border-top: 1px solid #444;
                gap: 12px;
            }

            .control-btn {
                padding: 6px 12px;
                border: none;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                font-weight: bold;
            }

            .play-btn { background: #27ae60; color: #fff; }
            .pause-btn { background: #f39c12; color: #fff; }
            .stop-btn { background: #e74c3c; color: #fff; }
            .reset-btn { background: #95a5a6; color: #fff; }

            .control-btn:hover {
                opacity: 0.8;
            }

            .progress-container {
                display: flex;
                align-items: center;
                gap: 8px;
                flex: 1;
            }

            .progress-label, .status-label {
                font-size: 12px;
                color: #ccc;
                white-space: nowrap;
            }

            .progress-bar {
                flex: 1;
                height: 6px;
                background: #3d3d3d;
                border-radius: 3px;
                overflow: hidden;
            }

            .progress-fill {
                height: 100%;
                background: #3498db;
                transition: width 0.3s ease;
            }

            .progress-text {
                font-size: 11px;
                color: #ccc;
                min-width: 40px;
                text-align: right;
            }

            .status-container {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .status-text {
                font-size: 12px;
                color: #fff;
                min-width: 80px;
            }
        `;
        document.head.appendChild(style);
    }

    // ==================== 工具方法 ====================

    private getNodeTypeText(type: AnimationNodeType): string {
        switch (type) {
            case AnimationNodeType.SINGLE: return '单个动画';
            case AnimationNodeType.SEQUENCE: return '序列动画';
            case AnimationNodeType.PARALLEL: return '并行动画';
            default: return '未知';
        }
    }

    private getStatusText(status: AnimationStatus): string {
        switch (status) {
            case AnimationStatus.PENDING: return '等待中';
            case AnimationStatus.RUNNING: return '运行中';
            case AnimationStatus.COMPLETED: return '已完成';
            case AnimationStatus.PAUSED: return '已暂停';
            case AnimationStatus.ERROR: return '错误';
            default: return '未知';
        }
    }

    private getEdgeTypeText(type: AnimationEdgeType): string {
        switch (type) {
            case AnimationEdgeType.SEQUENCE: return '顺序执行';
            case AnimationEdgeType.TRIGGER: return '触发关系';
            case AnimationEdgeType.DEPENDENCY: return '依赖关系';
            default: return '未知';
        }
    }

    // ==================== 公共API ====================

    /**
     * 播放指定动画
     */
    public playAnimation(animationId: string): void {
        this.manager.play(animationId);
    }

    /**
     * 暂停指定动画
     */
    public pauseAnimation(animationId: string): void {
        this.manager.pause(animationId);
    }

    /**
     * 停止指定动画
     */
    public stopAnimation(animationId: string): void {
        this.manager.stop(animationId);
    }

    /**
     * 加载动画图
     */
    public loadGraph(): void {
        // 创建文件输入
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const graph = JSON.parse(e.target?.result as string);
                        this.manager.setAnimationGraph(graph);
                        this.renderer?.renderGraph(graph);
                        logInfo('[动画状态图UI] 图加载成功');
                    } catch (error) {
                        logError('[动画状态图UI] 图加载失败:', error);
                        alert('加载失败：文件格式错误');
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    /**
     * 保存动画图
     */
    public saveGraph(): void {
        const graph = this.manager.getAnimationGraph();
        const dataStr = JSON.stringify(graph, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `animation-graph-${Date.now()}.json`;
        link.click();

        logInfo('[动画状态图UI] 图保存成功');
    }

    /**
     * 清空动画图
     */
    public clearGraph(): void {
        if (confirm('确定要清空动画图吗？')) {
            this.manager.clearAnimationGraph();
            this.renderer?.renderGraph({ nodes: [], edges: [] });
            this.clearDetails();
            logInfo('[动画状态图UI] 图已清空');
        }
    }

    /**
     * 更新布局
     */
    public updateLayout(algorithm: string): void {
        this.manager.updateConfig({ layoutAlgorithm: algorithm as any });
        this.renderer?.updateConfig({ layoutAlgorithm: algorithm as any });
        this.renderer?.relayout();
    }

    /**
     * 导出图片
     */
    public exportImage(): void {
        if (!this.renderer) return;

        const imageData = this.renderer.exportImage('png');
        const link = document.createElement('a');
        link.href = imageData;
        link.download = `animation-graph-${Date.now()}.png`;
        link.click();

        logInfo('[动画状态图UI] 图片导出成功');
    }

    /**
     * 获取动画管理器
     */
    public getManager(): AnimationGraphManager {
        return this.manager;
    }

    /**
     * 获取渲染器
     */
    public getRenderer(): AnimationGraphRenderer | null {
        return this.renderer;
    }

    /**
     * 销毁UI
     */
    public destroy(): void {
        this.renderer?.destroy();
        this.manager.destroy();

        // 清理全局引用
        delete (window as any).animationGraphUI;

        logInfo('[动画状态图UI] 已销毁');
    }

    /**
     * 加载演示数据
     */
    public loadDemoData(): void {
        // 创建演示动画图数据
        const demoGraph = {
            nodes: [
                {
                    id: 'anim-1',
                    name: '淡入动画',
                    type: AnimationNodeType.SINGLE,
                    duration: 1000,
                    status: AnimationStatus.PENDING,
                    progress: 0,
                    params: { opacity: { from: 0, to: 1 } },
                    targetNodeId: 'node-1'
                },
                {
                    id: 'anim-2',
                    name: '移动动画',
                    type: AnimationNodeType.SINGLE,
                    duration: 2000,
                    status: AnimationStatus.PENDING,
                    progress: 0,
                    params: { position: { from: { x: 0, y: 0 }, to: { x: 100, y: 50 } } },
                    targetNodeId: 'node-1'
                },
                {
                    id: 'anim-3',
                    name: '缩放动画',
                    type: AnimationNodeType.SINGLE,
                    duration: 1500,
                    status: AnimationStatus.PENDING,
                    progress: 0,
                    params: { scale: { from: 1, to: 1.5 } },
                    targetNodeId: 'node-2'
                },
                {
                    id: 'sequence-1',
                    name: '序列动画组',
                    type: AnimationNodeType.SEQUENCE,
                    duration: 3000,
                    status: AnimationStatus.PENDING,
                    progress: 0,
                    childrenIds: ['anim-1', 'anim-2']
                },
                {
                    id: 'parallel-1',
                    name: '并行动画组',
                    type: AnimationNodeType.PARALLEL,
                    duration: 2000,
                    status: AnimationStatus.PENDING,
                    progress: 0,
                    childrenIds: ['anim-2', 'anim-3']
                }
            ],
            edges: [
                {
                    id: 'edge-1',
                    source: 'anim-1',
                    target: 'anim-2',
                    type: AnimationEdgeType.SEQUENCE,
                    delay: 0
                },
                {
                    id: 'edge-2',
                    source: 'sequence-1',
                    target: 'anim-3',
                    type: AnimationEdgeType.TRIGGER,
                    delay: 500
                },
                {
                    id: 'edge-3',
                    source: 'anim-2',
                    target: 'parallel-1',
                    type: AnimationEdgeType.DEPENDENCY,
                    condition: 'progress > 0.5'
                }
            ],
            metadata: {
                name: '演示动画图',
                description: '展示各种动画关系的演示数据',
                version: '1.0.0',
                createdAt: Date.now(),
                updatedAt: Date.now()
            }
        };

        // 设置动画图数据
        this.manager.setAnimationGraph(demoGraph);
        this.renderer?.renderGraph(demoGraph);
        this.clearDetails();

        logInfo('[动画状态图UI] 演示数据加载成功');

        // 启动演示动画序列
        setTimeout(() => this.startDemoAnimation(), 1000);
    }

    /**
     * 启动演示动画
     */
    private startDemoAnimation(): void {
        const animations = ['anim-1', 'anim-2', 'anim-3', 'sequence-1', 'parallel-1'];
        let currentIndex = 0;

        const playNext = () => {
            if (currentIndex >= animations.length) {
                logInfo('[演示动画] 演示完成');
                return;
            }

            const animId = animations[currentIndex];
            logInfo(`[演示动画] 开始播放: ${animId}`);

            // 发送开始事件
            window.dispatchEvent(new CustomEvent('cocosAnimationEvent', {
                detail: {
                    type: 'start',
                    animationId: animId,
                    timestamp: Date.now()
                }
            }));

            // 模拟进度更新
            let progress = 0;
            const progressInterval = setInterval(() => {
                progress += 0.1;
                if (progress <= 1) {
                    window.dispatchEvent(new CustomEvent('cocosAnimationEvent', {
                        detail: {
                            type: 'progress',
                            animationId: animId,
                            timestamp: Date.now(),
                            data: { progress }
                        }
                    }));
                } else {
                    clearInterval(progressInterval);
                    // 发送完成事件
                    window.dispatchEvent(new CustomEvent('cocosAnimationEvent', {
                        detail: {
                            type: 'complete',
                            animationId: animId,
                            timestamp: Date.now()
                        }
                    }));

                    currentIndex++;
                    setTimeout(playNext, 500); // 延迟500ms播放下一个
                }
            }, 200); // 每200ms更新一次进度
        };

        playNext();
    }
} 