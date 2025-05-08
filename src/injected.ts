/// <reference path="./types/cocos.d.ts" />

import { HookUIRenderer } from './hooks/HookUIRenderer';
import { RendererManager } from './renderers/RendererManager';
import { log, LogLevel } from './utils/log';
import { logError, logInfo, logNodeError, logWarn } from './utils/nodeLogger';

// 同步模式枚举
enum SyncMode {
    AUTO = 'auto',
    MANUAL = 'manual'
}

// 性能优化配置
interface PerformanceConfig {
    updateThrottleMs: number; // 更新节流时间（毫秒）
    maxNodesPerUpdate: number; // 每次更新最大节点数
    enableIncrementalUpdates: boolean; // 是否启用增量更新
}

// 添加LogSettings接口定义
interface LogSettings {
    currentLevel: LogLevel;
    levelEnabled: { [key in LogLevel]: boolean };
}

class CocosInspector {
    private container: HTMLElement | null = null;
    private selectedNode: cc.Node | null = null;
    private syncMode: SyncMode = SyncMode.AUTO;
    private updateIntervalId: number | null = null;
    private updateInterval: number = 200; // 更改为较低的默认刷新率，减轻性能压力
    private isCollapsed: boolean = false; // 是否折叠
    private lastWidth: number = 600; // 记住最后的宽度，从300px增加到600px
    private rendererManager: RendererManager; // 组件渲染器管理器
    private treeContainer: HTMLElement | null = null; // 树形结构容器
    private detailsContainer: HTMLElement | null = null; // 详细信息容器
    private expandedNodes: Set<string> = new Set(); // 存储已展开节点的UUID
    private expandedComponents: Set<string> = new Set(); // 存储已展开组件的UUID
    private treeSnapshot: string = ''; // 存储树结构的快照
    private sceneStructureHash: string = ''; // 存储场景结构的哈希值
    private lastUpdateTime: number = 0; // 上次更新时间
    private pendingUpdate: boolean = false; // 是否有待处理的更新
    private nodeRectOverlay: HTMLElement | null = null; // 节点矩形覆盖层

    // 性能配置
    private performanceConfig: PerformanceConfig = {
        updateThrottleMs: 100, // 最小更新间隔
        maxNodesPerUpdate: 50, // 每次更新的最大节点数
        enableIncrementalUpdates: true // 默认启用增量更新
    };

    constructor() {
        this.rendererManager = new RendererManager();
        this.init();
    }

    private init(): void {
        // 创建UI
        this.createUI();

        // 添加缩放和滚动监听
        this.setupResizeObserver();

        // 初始化树结构
        this.initTree();

        // 启动更新
        this.startUpdate();

        // 初始化钩子按钮事件监听
        if (this.container) {
            HookUIRenderer.initHookButtonListeners(this.container, () => this.selectedNode);
        }

        // 添加窗口大小调整监听，用于更新NODE RECT覆盖层位置
        window.addEventListener('resize', this.handleWindowResize.bind(this));

        // 监听场景切换
        if (window.cc && window.cc.director) {
            // 使用any类型避免TypeScript编译错误
            const director = window.cc.director as any;
            if (typeof director.loadScene === 'function') {
                const originalSceneLoadScene = director.loadScene;
                director.loadScene = (...args: any[]) => {
                    // 移除覆盖层
                    this.removeNodeRectOverlay();
                    // 调用原始方法
                    return originalSceneLoadScene.apply(director, args);
                };
            }
        }
    }

    /**
     * 处理窗口大小调整，更新NODE RECT覆盖层位置
     */
    private handleWindowResize(): void {
        // 如果当前选中了节点，重新创建覆盖层
        if (this.selectedNode) {
            // 首先移除现有覆盖层
            this.removeNodeRectOverlay();
            // 重新创建覆盖层
            this.createNodeRectOverlay(this.selectedNode);
        }
    }

    private createUI(): void {
        this.container = document.createElement('div');
        this.container.className = 'cocos-inspector';

        // 添加CSS样式
        const style = document.createElement('style');
        style.textContent = `
            /* 节点状态样式 */
            .node-inactive {
                opacity: 0.7;
            }
            .inactive-node {
                text-decoration: line-through;
                color: #999;
            }
            
            /* Active状态指示器 */
            .active-indicator {
                margin-left: 5px;
                font-size: 11px;
                padding: 1px 4px;
                border-radius: 3px;
            }
            .active-indicator.active {
                background-color: #4caf50;
                color: white;
            }
            .active-indicator.inactive {
                background-color: #ff5252;
                color: white;
            }
            
            /* 更新状态指示器 */
            @keyframes pulse {
                0% { opacity: 0.6; }
                50% { opacity: 1; }
                100% { opacity: 0.6; }
            }
            .updating-indicator {
                position: absolute;
                top: 5px;
                right: 5px;
                background-color: #2196F3;
                color: white;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 3px;
                animation: pulse 1.5s infinite;
                pointer-events: none;
            }
            
            /* 错误指示器 */
            .error-indicator {
                position: absolute;
                top: 5px;
                right: 5px;
                background-color: #f44336;
                color: white;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 3px;
            }
        `;
        document.head.appendChild(style);

        // 添加折叠按钮
        const collapseBtn = document.createElement('div');
        collapseBtn.className = 'collapse-btn';
        collapseBtn.addEventListener('click', () => this.toggleCollapse());
        this.container.appendChild(collapseBtn);

        // 创建头部
        const header = document.createElement('div');
        header.className = 'cocos-inspector-header';

        // 添加标题
        const title = document.createElement('h3');
        title.textContent = 'Cocos Inspector';
        header.appendChild(title);

        // 添加控制栏
        const controls = document.createElement('div');
        controls.className = 'inspector-controls';

        // 同步模式选择
        const syncControls = document.createElement('div');
        syncControls.className = 'sync-controls';

        // 自动同步按钮
        const autoBtn = document.createElement('button');
        autoBtn.textContent = '自动刷新';
        autoBtn.className = 'sync-btn active';
        autoBtn.dataset.mode = SyncMode.AUTO;

        // 手动同步按钮
        const manualBtn = document.createElement('button');
        manualBtn.textContent = '手动刷新';
        manualBtn.className = 'sync-btn';
        manualBtn.dataset.mode = SyncMode.MANUAL;

        // 刷新按钮 (手动模式下使用)
        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = '刷新';
        refreshBtn.className = 'refresh-btn';
        refreshBtn.style.display = 'none';

        // 强制刷新按钮 (始终显示)
        const forceRefreshBtn = document.createElement('button');
        forceRefreshBtn.textContent = '强制刷新';
        forceRefreshBtn.className = 'force-refresh-btn';
        forceRefreshBtn.title = '强制重建整个树结构';

        // 添加按钮点击事件
        autoBtn.addEventListener('click', () => this.setSyncMode(SyncMode.AUTO));
        manualBtn.addEventListener('click', () => this.setSyncMode(SyncMode.MANUAL));
        refreshBtn.addEventListener('click', () => this.updateTree());
        forceRefreshBtn.addEventListener('click', () => this.forceRefreshTree());

        syncControls.appendChild(autoBtn);
        syncControls.appendChild(manualBtn);
        controls.appendChild(syncControls);
        controls.appendChild(refreshBtn);
        controls.appendChild(forceRefreshBtn);

        // 添加性能设置按钮
        const performanceBtn = document.createElement('button');
        performanceBtn.textContent = '性能设置';
        performanceBtn.className = 'performance-btn';
        performanceBtn.title = '调整刷新率和性能设置';
        performanceBtn.addEventListener('click', () => this.showPerformanceSettings());
        controls.appendChild(performanceBtn);

        // 添加日志设置按钮
        const logSettingsBtn = document.createElement('button');
        logSettingsBtn.textContent = '日志设置';
        logSettingsBtn.className = 'log-settings-btn';
        logSettingsBtn.title = '调整日志输出级别';
        logSettingsBtn.addEventListener('click', () => this.showLogSettings());
        controls.appendChild(logSettingsBtn);

        header.appendChild(controls);

        // 创建内容区
        const content = document.createElement('div');
        content.className = 'cocos-inspector-content';

        // 创建树形结构容器
        this.treeContainer = document.createElement('div');
        this.treeContainer.className = 'node-tree-container';

        // 创建详细信息容器
        this.detailsContainer = document.createElement('div');
        this.detailsContainer.className = 'node-details-container';
        this.detailsContainer.innerHTML = '<div class="no-selection">请在左侧选择一个节点</div>';

        content.appendChild(this.treeContainer);
        content.appendChild(this.detailsContainer);

        this.container.appendChild(header);
        this.container.appendChild(content);
        document.body.appendChild(this.container);

        // 添加快捷键支持
        document.addEventListener('keydown', (e) => {
            // 按 Alt+I 切换Inspector的显示/隐藏
            if (e.altKey && e.key === 'i') {
                this.toggleCollapse();
            }
        });

        // 监听宽度变化
        this.setupResizeObserver();
    }

    private setupResizeObserver(): void {
        if (this.container && typeof ResizeObserver !== 'undefined') {
            // 记住调整前的宽度
            this.container.addEventListener('mousedown', (e) => {
                const container = this.container;
                if (container && e.offsetX > container.offsetWidth - 10) {
                    this.lastWidth = container.offsetWidth;
                }
            });

            // 使用ResizeObserver监听大小变化
            const resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const width = entry.contentRect.width;
                    // 保存新宽度
                    if (width > 0 && !this.isCollapsed) {
                        this.lastWidth = width;
                    }
                }
            });

            resizeObserver.observe(this.container);
        }
    }

    private toggleCollapse(): void {
        this.isCollapsed = !this.isCollapsed;
        if (this.container) {
            this.container.classList.toggle('collapsed', this.isCollapsed);

            // 如果展开，恢复之前的宽度
            if (!this.isCollapsed && this.lastWidth) {
                this.container.style.width = `${this.lastWidth}px`;
            }
        }
    }

    private setSyncMode(mode: SyncMode): void {
        this.syncMode = mode;

        // 更新按钮状态
        const buttons = this.container?.querySelectorAll('.sync-btn');
        buttons?.forEach(btn => {
            if (btn instanceof HTMLElement) {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            }
        });

        // 更新刷新按钮显示
        const refreshBtn = this.container?.querySelector('.refresh-btn');
        if (refreshBtn instanceof HTMLElement) {
            refreshBtn.style.display = mode === SyncMode.MANUAL ? 'inline-block' : 'none';
        }

        // 控制自动刷新
        if (mode === SyncMode.AUTO) {
            this.startAutoUpdate();
        } else {
            this.stopAutoUpdate();
        }
    }

    private startAutoUpdate(): void {
        // 清除可能存在的旧定时器
        this.stopAutoUpdate();

        // 显示更新指示器
        this.showUpdatingIndicator();

        // 立即更新一次
        this.updateTree();
        this.lastUpdateTime = Date.now();

        // 创建新的定时器，使用更新间隔
        this.updateIntervalId = window.setInterval(() => {
            // 显示更新指示器
            this.showUpdatingIndicator();

            // 检查是否应该跳过此次更新（节流）
            const now = Date.now();
            const timeSinceLastUpdate = now - this.lastUpdateTime;

            // 如果上次更新时间过短且不是强制更新，跳过此次更新
            if (timeSinceLastUpdate < this.performanceConfig.updateThrottleMs && this.pendingUpdate) {
                logInfo(`节流控制：跳过更新 (${timeSinceLastUpdate}ms < ${this.performanceConfig.updateThrottleMs}ms)`);
                return;
            }

            // 执行更新
            try {
                this.updateTree();
                this.lastUpdateTime = now;
                this.pendingUpdate = false;

                // 隐藏错误指示器
                this.hideErrorIndicator();
            } catch (error) {
                logError('自动更新失败:', error);
                this.showErrorIndicator('更新失败，请刷新');
            }
        }, this.updateInterval) as unknown as number;

        logInfo(`自动更新已启动，间隔: ${this.updateInterval}ms，节流: ${this.performanceConfig.updateThrottleMs}ms`);
    }

    private stopAutoUpdate(): void {
        if (this.updateIntervalId !== null) {
            window.clearInterval(this.updateIntervalId);
            this.updateIntervalId = null;
        }
    }

    private initTree(): void {
        const scene = cc.director.getScene();
        if (!scene) return;

        // logInfo(`[初始化树] 场景: ${scene.name}(${scene.uuid}), 子节点数: ${scene.children?.length || 0}`, scene);
        if (this.treeContainer) {
            this.treeContainer.innerHTML = this.generateNodeTree(scene);
        }
    }

    private generateNodeTree(scene: cc.Node): string {
        // 如果场景为空，返回空字符串
        if (!scene) return '<div class="empty-scene">Scene is empty</div>';

        // logInfo(`[生成树结构] 开始生成场景: ${scene.name}(${scene.uuid}), 子节点数: ${scene.children?.length || 0}`, scene);

        // 创建根节点列表
        let html = '<ul class="node-tree">';

        // 检查是否是场景节点
        const isScene = scene === cc.director.getScene();

        // 渲染根节点
        html += this.generateNodeItem(scene, true); // 场景根节点总是处于active状态

        html += '</ul>';
        // console.log(`[生成树结构] 完成生成场景树 ${scene.name}(${scene.uuid})`);
        return html;
    }

    private generateNodeItem(node: cc.Node, isActive?: boolean): string {
        if (!node || !node.uuid) {
            logWarn(`[生成节点项] 节点无效或UUID缺失`);
            return '';
        }

        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = this.expandedNodes.has(node.uuid);
        const toggleClass = hasChildren ? 'node-toggle' : 'node-toggle-empty';
        const toggleText = hasChildren ? (isExpanded ? '▼' : '▶') : '';
        const childrenStyle = isExpanded ? '' : 'display: none;';

        // 检查是否是场景节点
        const isScene = node === cc.director.getScene();

        // 对于场景节点，active总是true
        const active = isActive !== undefined ? isActive :
            (isScene ? true : (node.active !== undefined ? node.active : true));

        const activeClass = active ? '' : 'node-inactive';

        const childrenCount = node.children?.length || 0;
        // console.log(`[生成节点项] ${isScene ? '场景' : '节点'}: ${node.name}(${node.uuid}), 激活: ${active}, 子节点: ${childrenCount}`);

        let html = `
            <li data-uuid="${node.uuid}" class="${activeClass}">
                <div class="node-tree-item">
                    <span class="${toggleClass}">${toggleText}</span>
                    <span class="node-name ${active ? '' : 'inactive-node'}">${node.name}</span>
                </div>
        `;

        if (hasChildren) {
            // console.log(`[生成节点项] 处理 ${node.name}(${node.uuid}) 的 ${childrenCount} 个子节点`);
            // 创建一个子节点容器
            html += `<ul class="node-children" style="${childrenStyle}">`;

            // 递归处理每个子节点
            node.children.forEach((child, index) => {
                if (child) {
                    // console.log(`[生成节点项] 处理 ${node.name}(${node.uuid}) 的第 ${index + 1}/${childrenCount} 个子节点: ${child.name}(${child.uuid})`);
                    html += this.generateNodeItem(child);
                } else {
                    logWarn(`[生成节点项] ${node.name}(${node.uuid}) 的第 ${index + 1}/${childrenCount} 个子节点为空`);
                }
            });

            // 关闭子节点容器
            html += '</ul>';
        }

        html += '</li>';
        return html;
    }

    private startUpdate(): void {
        // 添加树节点事件监听
        this.container?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const toggle = target.closest('.node-toggle');
            const item = target.closest('.node-tree-item');
            const componentHeader = target.closest('.component-header');

            if (toggle) {
                const li = toggle.closest('li');
                if (!li) return;

                const uuid = li.dataset.uuid;
                if (!uuid) return;

                const children = li.querySelector('.node-children') as HTMLElement;
                if (children) {
                    const isExpanded = toggle.textContent === '▼';
                    toggle.textContent = isExpanded ? '▶' : '▼';
                    children.style.display = isExpanded ? 'none' : '';

                    // 记录或移除展开状态
                    if (isExpanded) {
                        this.expandedNodes.delete(uuid);
                    } else {
                        this.expandedNodes.add(uuid);
                    }
                }
            }

            if (item) {
                const uuid = item.closest('li')?.dataset.uuid;
                if (uuid) {
                    this.selectNode(uuid);
                }
            }

            // 组件折叠/展开
            if (componentHeader) {
                const componentItem = componentHeader.closest('.component-item');
                if (!componentItem) return;

                // 将 componentItem 强制转换为 HTMLElement 以使用 dataset 属性
                const componentElement = componentItem as HTMLElement;
                const componentId = componentElement.dataset.componentId;
                if (!componentId) return;

                const toggle = componentHeader.querySelector('.component-toggle');
                const content = componentItem.querySelector('.component-content');

                if (toggle && content) {
                    const isCollapsed = toggle.classList.contains('collapsed');
                    toggle.classList.toggle('collapsed');
                    content.classList.toggle('collapsed');

                    // 记录组件展开状态
                    if (isCollapsed) {
                        this.expandedComponents.add(componentId);
                    } else {
                        this.expandedComponents.delete(componentId);
                    }
                }
            }
        });

        // 添加属性编辑事件监听
        this.container?.addEventListener('change', (e) => {
            const target = e.target as HTMLElement;

            // 检查是否是属性输入框
            if (target.classList.contains('property-input') || target.classList.contains('property-checkbox')) {
                this.handlePropertyChange(target);
            }
        });

        // 默认开始自动更新
        this.setSyncMode(SyncMode.AUTO);
    }

    private handlePropertyChange(inputElement: HTMLElement): void {
        if (!this.selectedNode) return;

        if (inputElement instanceof HTMLInputElement) {
            const property = inputElement.dataset.property;
            const type = inputElement.dataset.type;

            if (!property) return;

            logInfo(`[属性变更] ${property}, 节点: ${this.selectedNode.name}(${this.selectedNode.uuid})`, this.selectedNode);

            // 首先检查节点是否有此属性
            const hasProperty = property.includes('.')
                ? this.checkNestedProperty(this.selectedNode, property)
                : property in this.selectedNode;

            if (!hasProperty) {
                logWarn(`[属性校验] 节点不包含属性: ${property}, 节点: ${this.selectedNode.name}(${this.selectedNode.uuid})`, this.selectedNode);
                return;
            }

            // 根据输入类型处理
            if (inputElement.type === 'checkbox') {
                // 布尔值
                const value = inputElement.checked;
                this.updateNodeProperty(this.selectedNode, property, value);

                // 如果更改的是active属性，则可能影响场景结构，强制刷新树
                if (property === 'active') {
                    // 确保节点的active状态立即生效
                    this.selectedNode.active = value;
                    logInfo(`[属性变更] 更新节点激活状态: ${this.selectedNode.name}(${this.selectedNode.uuid}), active: ${value}`, this.selectedNode);

                    // 通知场景节点状态发生变化
                    if (window.cc && window.cc.director && window.cc.director.getScene) {
                        // 强制更新场景，确保active状态变化立即显示
                        const scene = window.cc.director.getScene();
                        if (scene) {
                            // 触发场景更新
                            logInfo(`[场景更新] 准备刷新场景视图，节点: ${this.selectedNode.name}(${this.selectedNode.uuid})`, this.selectedNode);
                            this.refreshSceneView();

                            // 先保存当前选中节点的引用，以便在刷新后仍能找到它
                            const currentUUID = this.selectedNode.uuid;

                            // 先刷新当前节点的详情
                            this.updateDetails();

                            // 马上刷新树视图，不使用延迟
                            logInfo(`[场景更新] 准备强制刷新树结构，节点: ${this.selectedNode.name}(${this.selectedNode.uuid})`, this.selectedNode);
                            this.forceRefreshTree();

                            // 确保节点在UI中的状态保持正确，即使被禁用
                            const nodeElement = this.container?.querySelector(`li[data-uuid="${currentUUID}"]`);
                            if (nodeElement) {
                                // 添加禁用样式类，使节点在树视图中显示为禁用状态
                                if (!value) {
                                    nodeElement.classList.add('node-inactive');
                                    logInfo(`[UI更新] 添加禁用样式到节点: ${this.selectedNode.name}(${this.selectedNode.uuid})`, this.selectedNode);
                                } else {
                                    nodeElement.classList.remove('node-inactive');
                                    logInfo(`[UI更新] 移除禁用样式从节点: ${this.selectedNode.name}(${this.selectedNode.uuid})`, this.selectedNode);
                                }

                                // 确保节点在树中可见
                                setTimeout(() => {
                                    if (nodeElement && !value) {
                                        // 对于禁用的节点，添加特殊样式
                                        const nameElement = nodeElement.querySelector('.node-name');
                                        if (nameElement) {
                                            nameElement.classList.add('inactive-node');
                                            logInfo(`[UI更新] 为节点名称添加禁用样式: ${this.selectedNode?.name}(${currentUUID})`, this.selectedNode);
                                        }
                                    }
                                }, 50);
                            } else {
                                logWarn(`[UI更新] 未找到要更新样式的节点元素: ${currentUUID}`);
                            }
                        }
                    }
                }
            } else {
                // 数字或文本
                let value: any = inputElement.value;

                // 对于数字输入，转换为数值
                if (inputElement.classList.contains('property-number')) {
                    value = parseFloat(value);
                    if (isNaN(value)) return;
                }

                logInfo(`[属性变更] 更新属性值: ${property} = ${value}, 节点: ${this.selectedNode.name}(${this.selectedNode.uuid})`);
                this.updateNodeProperty(this.selectedNode, property, value);

                // 如果修改的是节点名称，需要更新树视图
                if (property === 'name') {
                    // 短暂延迟后刷新整个树
                    logInfo(`[属性变更] 节点名称已修改，准备刷新树: ${value}(${this.selectedNode.uuid})`);
                    setTimeout(() => this.forceRefreshTree(), 300);
                }
            }

            // 如果在自动更新模式下，马上更新面板
            if (this.syncMode === SyncMode.AUTO) {
                this.updateDetails();
            }

            // 检查是否修改了变换属性（position、eulerAngles或scale），需要刷新场景视图
            if (property.startsWith('position') || property.startsWith('eulerAngles') || property.startsWith('scale')) {
                logInfo(`[属性变更] 变换属性已修改，刷新场景视图: ${property}, 节点: ${this.selectedNode.name}(${this.selectedNode.uuid})`);
                this.refreshSceneView();
            }
        }
    }

    // 检查嵌套属性是否存在
    private checkNestedProperty(obj: any, path: string): boolean {
        const parts = path.split('.');
        let current = obj;

        for (let i = 0; i < parts.length; i++) {
            if (current === undefined || current === null) {
                return false;
            }
            if (!(parts[i] in current)) {
                return false;
            }
            current = current[parts[i]];
        }

        return true;
    }

    private updateNodeProperty(node: cc.Node, property: string, value: any): void {
        try {
            // 处理嵌套属性，例如 "eulerAngles.x"
            if (property.includes('.')) {
                const parts = property.split('.');
                const mainProp = parts[0];
                const subProp = parts[1];

                if (node[mainProp as keyof cc.Node] !== undefined &&
                    typeof node[mainProp as keyof cc.Node] === 'object') {
                    const obj = node[mainProp as keyof cc.Node] as any;

                    // 检查子属性是否存在
                    if (obj && subProp in obj) {
                        const oldValue = obj[subProp];
                        obj[subProp] = value;

                        // 特殊处理向量类型属性(position, eulerAngles, scale)
                        // 这些属性修改分量后，需要重新赋值整个对象以确保引擎能感知到变化
                        if (mainProp === 'position' || mainProp === 'eulerAngles' || mainProp === 'scale') {
                            try {
                                // 检查cc.Vector3是否可用
                                if (typeof cc.Vector3 === 'function') {
                                    // 创建新的Vector3对象
                                    const newVector = new cc.Vector3(obj.x, obj.y, obj.z);

                                    // 使用新创建的Vector3对象更新属性
                                    (node as any)[mainProp] = newVector;
                                } else {
                                    // 回退方法：直接复制属性
                                    const currentObj = (node as any)[mainProp];
                                    if (currentObj) {
                                        // 确保引用变化，触发更新
                                        const newObj = { ...currentObj };
                                        newObj[subProp] = value;
                                        (node as any)[mainProp] = newObj;
                                    }
                                }
                                logInfo(`更新向量属性: ${property}, 旧值: ${oldValue}, 新值: ${value}, 节点: ${node.name}(${node.uuid})`, node);
                            } catch (e) {
                                logError(`更新向量属性失败: ${property}`, e);
                            }
                        } else {
                            logInfo(`更新嵌套属性: ${property}, 旧值: ${oldValue}, 新值: ${value}, 节点: ${node.name}(${node.uuid})`, node);
                        }
                    } else {
                        logWarn(`对象 ${mainProp} 不包含子属性: ${subProp}, 节点: ${node.name}(${node.uuid})`, node);
                    }
                } else {
                    logWarn(`节点不包含有效对象属性: ${mainProp}, 节点: ${node.name}(${node.uuid})`, node);
                }
            } else {
                // 确保属性存在
                if (property in node) {
                    const oldValue = (node as any)[property];
                    (node as any)[property] = value;
                    logInfo(`更新属性: ${property}, 旧值: ${oldValue}, 新值: ${value}, 节点: ${node.name}(${node.uuid})`);
                } else {
                    logWarn(`节点不包含属性: ${property}, 节点: ${node.name}(${node.uuid})`);
                }
            }

            // 如果在自动更新模式下，马上更新面板
            if (this.syncMode === SyncMode.AUTO) {
                this.updateDetails();
            }
        } catch (error) {
            logError('更新属性失败:', error, `节点: ${node.name}(${node.uuid})`);
        }
    }

    private selectNode(uuid: string): void {
        // 移除之前的选中状态
        const selected = this.container?.querySelector('.node-tree-item.selected');
        if (selected) selected.classList.remove('selected');

        // 添加新的选中状态
        const item = this.container?.querySelector(`[data-uuid="${uuid}"] .node-tree-item`);
        if (item) item.classList.add('selected');

        // 移除之前的节点矩形覆盖层
        this.removeNodeRectOverlay();

        // 更新选中的节点
        const scene = cc.director.getScene();
        this.selectedNode = this.findNodeByUUID(scene, uuid);

        // 更新详细信息面板
        this.updateDetails();

        if (this.selectedNode) {
            logInfo(`选中节点: ${this.selectedNode.name}(${this.selectedNode.uuid})`, this.selectedNode);

            // 为所有选中的节点创建矩形覆盖层，不再仅限于容器节点
            this.createNodeRectOverlay(this.selectedNode);
        } else {
            logInfo(`未能找到UUID为 ${uuid} 的节点`);
        }
    }

    /**
     * 创建节点矩形覆盖层
     * @param node 要高亮显示的节点
     */
    private createNodeRectOverlay(node: cc.Node): void {
        try {
            // 首先尝试找到游戏Canvas元素
            const canvas = document.querySelector('canvas');
            if (!canvas) {
                logWarn(`[节点矩形] 找不到Canvas元素，无法创建矩形覆盖层，节点: ${node.name}(${node.uuid})`, node);
                return;
            }

            // 获取节点位置和大小信息
            const nodePosition = node.position || { x: node.x || 0, y: node.y || 0 };
            const nodeWidth = node.width || 100;
            const nodeHeight = node.height || 100;

            // 获取Canvas的大小和位置
            const canvasRect = canvas.getBoundingClientRect();

            // 创建覆盖层
            const overlay = document.createElement('div');
            overlay.className = 'node-rect-overlay';
            overlay.id = 'node-rect-overlay';

            // 设置样式
            overlay.style.position = 'absolute';
            overlay.style.border = '2px solid #ff3333';
            overlay.style.boxSizing = 'border-box';
            overlay.style.pointerEvents = 'none'; // 不影响交互
            overlay.style.zIndex = '9999';

            // 计算节点在Canvas中的位置
            // 注意：这里可能需要根据实际的Cocos坐标系转换进行调整
            const canvasCenterX = canvasRect.width / 2;
            const canvasCenterY = canvasRect.height / 2;

            // Cocos引擎中，通常(0,0)是屏幕中心，所以需要转换
            const left = canvasRect.left + canvasCenterX + nodePosition.x - nodeWidth / 2;
            const top = canvasRect.top + canvasCenterY - nodePosition.y - nodeHeight / 2;

            // 设置位置和大小
            overlay.style.left = `${left}px`;
            overlay.style.top = `${top}px`;
            overlay.style.width = `${nodeWidth}px`;
            overlay.style.height = `${nodeHeight}px`;

            // 添加到DOM
            document.body.appendChild(overlay);

            // 保存引用，以便后续删除
            this.nodeRectOverlay = overlay;

            logInfo(`[节点矩形] 创建矩形覆盖层，节点: ${node.name}(${node.uuid}), 位置: (${left}, ${top}), 尺寸: ${nodeWidth}x${nodeHeight}`, node);
        } catch (error) {
            logNodeError('[节点矩形] 创建矩形覆盖层出错', node, error);
        }
    }

    /**
     * 移除节点矩形覆盖层
     */
    private removeNodeRectOverlay(): void {
        if (this.nodeRectOverlay) {
            this.nodeRectOverlay.remove();
            this.nodeRectOverlay = null;
            logInfo('[节点矩形] 移除矩形覆盖层');
        }

        // 额外检查，确保没有残留的覆盖层
        const existingOverlay = document.getElementById('node-rect-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
    }

    private updateDetails(): void {
        if (!this.detailsContainer || !this.selectedNode) {
            // 清空详情面板
            if (this.detailsContainer) {
                this.detailsContainer.innerHTML = '<div class="no-selection">请在左侧选择一个节点</div>';
                // console.log(`[详情面板] 清空详情面板，无选中节点`);
            }

            // 确保移除节点矩形覆盖层
            this.removeNodeRectOverlay();
            return;
        }

        // console.log(`[详情面板] 开始更新详情面板, 节点: ${this.selectedNode.name}(${this.selectedNode.uuid})`);

        // 记住当前滚动位置
        const scrollTop = this.detailsContainer.scrollTop;

        // 获取节点的所有组件
        const components = this.selectedNode._components || [];
        // console.log(`[详情面板] 节点 ${this.selectedNode.name}(${this.selectedNode.uuid}) 有 ${components.length} 个组件`);

        // 添加一个伪组件用于显示Transform信息
        const transformComponent = {
            uuid: 'transform_' + this.selectedNode.uuid,
            node: this.selectedNode,
            enabled: true,
            constructor: { name: 'Transform' }
        } as cc.Component;

        const allComponents = [transformComponent, ...components];

        // 增量更新详情面板
        this.updateDetailsIncremental(allComponents);

        // 恢复滚动位置
        this.detailsContainer.scrollTop = scrollTop;
        // console.log(`[详情面板] 详情面板更新完成, 节点: ${this.selectedNode.name}(${this.selectedNode.uuid})`);
    }

    // 增量更新详情面板
    private updateDetailsIncremental(components: cc.Component[]): void {
        if (!this.detailsContainer) return;
        if (!this.selectedNode) return;

        // 检查是否是新选择的节点
        const currentNodeId = this.selectedNode?.uuid;
        const detailsNodeId = this.detailsContainer.dataset.nodeId;

        // 如果是新节点，重建整个面板
        if (currentNodeId !== detailsNodeId) {
            // console.log(`[详情面板] 节点已更改，重建详情面板: ${this.selectedNode.name}(${currentNodeId})`);

            this.detailsContainer.innerHTML = this.rendererManager.renderComponents(components);
            this.detailsContainer.dataset.nodeId = currentNodeId || '';

            // 应用保存的组件展开状态
            this.applyComponentExpandState();
            return;
        }

        // console.log(`[详情面板] 对同一节点执行增量更新: ${this.selectedNode.name}(${currentNodeId})`);

        // 对于同一节点的更新，执行增量更新

        // 1. 收集当前显示的组件
        const visibleComponents = new Map<string, HTMLElement>();
        this.detailsContainer.querySelectorAll('.component-item').forEach(item => {
            if (item instanceof HTMLElement && item.dataset.componentId) {
                visibleComponents.set(item.dataset.componentId, item);
            }
        });
        // console.log(`[详情面板] 当前面板中有 ${visibleComponents.size} 个组件元素`);

        // 2. 跟踪需要移除的组件
        const componentIdsToKeep = new Set<string>();

        // 3. 更新或添加组件
        components.forEach((component, index) => {
            const componentId = component.uuid;
            componentIdsToKeep.add(componentId);
            const componentName = component.constructor?.name || 'Unknown';

            // 生成组件内容的哈希值
            const componentHash = this.generateComponentHash(component);

            // 检查组件是否存在
            const existingComponent = visibleComponents.get(componentId);

            // 组件不存在，添加新组件
            if (!existingComponent) {
                // console.log(`[详情面板] 添加新组件: ${componentName}, ID: ${componentId}, 节点: ${this.selectedNode?.name}(${this.selectedNode?.uuid})`);
                const componentHtml = this.rendererManager.renderComponent(component);

                // 创建临时容器并添加组件HTML
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = componentHtml;
                const newComponent = tempDiv.firstElementChild as HTMLElement;

                // 如果组件应该展开，设置展开状态
                if (this.expandedComponents.has(componentId) && newComponent) {
                    const toggle = newComponent.querySelector('.component-toggle');
                    const content = newComponent.querySelector('.component-content');
                    if (toggle) toggle.classList.remove('collapsed');
                    if (content) content.classList.remove('collapsed');
                }

                // 设置哈希值
                if (newComponent) {
                    newComponent.dataset.hash = componentHash;
                }

                // 添加到详情面板
                if (this.detailsContainer && newComponent) {
                    this.detailsContainer.appendChild(newComponent);
                    // console.log(`[详情面板] 新组件 ${componentName}(${componentId}) 已添加到面板`);
                }
            }
            // 组件存在但可能需要更新
            else {
                const existingHash = existingComponent.dataset.hash;

                // 如果哈希值不同，更新组件内容
                if (existingHash !== componentHash) {
                    // console.log(`[详情面板] 更新组件内容: ${componentName}(${componentId}), 节点: ${this.selectedNode?.name}(${this.selectedNode?.uuid})`);
                    // console.log(`[详情面板] 组件哈希变化 - 旧: ${existingHash}, 新: ${componentHash}`);

                    // 保留组件展开状态
                    const isExpanded = !existingComponent.querySelector('.component-content')?.classList.contains('collapsed');

                    // 重新渲染组件内容
                    const contentContainer = existingComponent.querySelector('.component-content');
                    if (contentContainer) {
                        // 获取组件属性HTML
                        const propertyHtml = this.rendererManager.renderComponentProperties(component);

                        // 更新内容区域
                        contentContainer.innerHTML = propertyHtml;

                        // 更新组件标题
                        const titleElement = existingComponent.querySelector('.component-name');
                        if (titleElement) {
                            titleElement.textContent = componentName;
                        }

                        // 更新哈希值
                        existingComponent.dataset.hash = componentHash;
                        // console.log(`[详情面板] 组件 ${componentName}(${componentId}) 内容已更新`);
                    }
                } else {
                    // console.log(`[详情面板] 组件 ${componentName}(${componentId}) 无变化，跳过更新`);
                }
            }
        });

        // 4. 移除不再存在的组件
        visibleComponents.forEach((element, id) => {
            if (!componentIdsToKeep.has(id)) {
                const componentName = element.querySelector('.component-name')?.textContent || 'Unknown';
                // console.log(`[详情面板] 移除组件: ${componentName}(${id}), 节点: ${this.selectedNode?.name}(${this.selectedNode?.uuid})`);
                element.remove();
            }
        });
    }

    // 为组件生成哈希值
    private generateComponentHash(component: cc.Component): string {
        const componentName = component.constructor?.name || 'Unknown';
        let hash = `${componentName}:${component.enabled ? 1 : 0}`;
        const nodeInfo = component.node ? `${component.node.name}(${component.node.uuid})` : 'no-node';

        // 对于Transform组件，添加变换属性的哈希
        if (componentName === 'Transform' && component.node) {
            const node = component.node;

            // 添加位置信息
            if (node.position) {
                hash += `:pos[${node.position.x.toFixed(2)},${node.position.y.toFixed(2)},${node.position.z.toFixed(2)}]`;
            }

            // 添加旋转信息
            if (node.eulerAngles) {
                hash += `:rot[${node.eulerAngles.x.toFixed(2)},${node.eulerAngles.y.toFixed(2)},${node.eulerAngles.z.toFixed(2)}]`;
            }

            // 添加缩放信息 - 处理scale可能是number或Vector3的情况
            if (node.scale) {
                if (typeof node.scale === 'number') {
                    hash += `:scale[${node.scale.toFixed(2)},${node.scale.toFixed(2)},${node.scale.toFixed(2)}]`;
                } else {
                    hash += `:scale[${node.scale.x.toFixed(2)},${node.scale.y.toFixed(2)},${node.scale.z.toFixed(2)}]`;
                }
            }

            // console.log(`[组件哈希] 生成Transform组件哈希: ${hash}, 节点: ${nodeInfo}`);
        } else {
            // console.log(`[组件哈希] 生成组件哈希: ${hash}, 组件类型: ${componentName}, 节点: ${nodeInfo}`);
        }

        return hash;
    }

    private applyComponentExpandState(): void {
        if (!this.detailsContainer) return;

        const componentItems = this.detailsContainer.querySelectorAll('.component-item');
        componentItems.forEach(item => {
            if (item instanceof HTMLElement) {
                const componentId = item.dataset.componentId;
                if (componentId && this.expandedComponents.has(componentId)) {
                    const toggle = item.querySelector('.component-toggle');
                    const content = item.querySelector('.component-content');
                    if (toggle && content) {
                        toggle.classList.remove('collapsed');
                        content.classList.remove('collapsed');
                    }
                }
            }
        });
    }

    private findNodeByUUID(node: cc.Node, uuid: string): cc.Node | null {
        if (node.uuid === uuid) return node;
        if (node.children) {
            for (let child of node.children) {
                const found = this.findNodeByUUID(child, uuid);
                if (found) return found;
            }
        }
        return null;
    }

    private generateNodeHash(node: cc.Node): string {
        // 为节点生成包含更多信息的哈希值
        let hash = `${node.uuid}:${node.name}`;

        let isScene = node === cc.director.getScene();
        // 添加节点基本属性
        hash += `:${isScene ? 1 : node.active ? 1 : 0}`; // 活动状态

        // 添加位置信息
        const pos = node.position || { x: node.x || 0, y: node.y || 0, z: node.z || 0 };
        hash += `:p${Math.round(pos.x || 0)},${Math.round(pos.y || 0)},${Math.round(pos.z || 0)}`;

        // 添加组件信息
        if (node._components && node._components.length > 0) {
            const componentsHash = node._components
                .map(comp => comp.constructor?.name || 'unknown')
                .sort() // 排序以确保相同组件集合产生相同哈希
                .join(',');
            hash += `:c[${componentsHash}]`;
        }

        // 添加子节点信息 (数量和名称)
        hash += `:children[${node.children.length}]`;

        // 递归添加子节点结构信息
        if (node.children && node.children.length > 0) {
            // 对每个子节点递归生成哈希
            const childrenHash = node.children
                .map(child => this.generateNodeHash(child))
                .join('|');
            hash += `:${childrenHash}`;
        }

        return hash;
    }

    private hasSceneStructureChanged(scene: cc.Node): boolean {
        // 生成场景结构的新哈希值
        const newHash = this.generateNodeHash(scene);

        // 检查是否与上次哈希值不同
        if (newHash !== this.sceneStructureHash) {
            this.sceneStructureHash = newHash;
            return true;
        }

        return false;
    }

    private updateTree(): void {
        const scene = cc.director.getScene();
        if (!scene) {
            //console.warn(`[更新树] 场景不存在，跳过更新`);
            return;
        }

        // console.log(`[更新树] 开始更新场景: ${scene.name}(${scene.uuid}), 子节点数: ${scene.children?.length || 0}`);

        // 检查是否有正在进行的更新
        if (this.pendingUpdate) {
            const now = Date.now();
            // 如果自上次更新以来时间过短，跳过本次更新
            if (now - this.lastUpdateTime < this.performanceConfig.updateThrottleMs / 2) {
                // console.log(`[更新树] 节流控制：跳过更新 (${now - this.lastUpdateTime}ms < ${this.performanceConfig.updateThrottleMs / 2}ms)`);
                return;
            } else {
                // console.log(`[更新树] 有待处理的更新，但间隔足够，继续更新`);
            }
        }

        // 初始化时创建树结构
        if (!this.treeContainer?.querySelector('.node-tree')) {
            // console.log('[更新树] 首次创建树结构');
            if (this.treeContainer) {
                this.treeContainer.innerHTML = this.generateNodeTree(scene);
            }
            this.sceneStructureHash = this.generateNodeHash(scene);
            this.lastUpdateTime = Date.now();
            this.pendingUpdate = false;
            return;
        }

        // 检查哪些节点发生了变化，执行增量更新
        try {
            // console.log(`[更新树] 开始增量更新`);
            this.updateNodeTreeIncremental(scene);
            // 成功完成完整更新后，清除待更新标记
            if (!this.pendingUpdate) {
                // console.log(`[更新树] 增量更新完成，更新场景哈希`);
                this.sceneStructureHash = this.generateNodeHash(scene);
            } else {
                // console.log(`[更新树] 增量更新未完成所有节点，待更新标记保持为true`);
            }
        } catch (error) {
            logError('[更新树] 更新树结构失败:', error);
            this.pendingUpdate = false;
        }

        // 即使在出错情况下，也记录本次更新时间，避免短时间内重复尝试
        this.lastUpdateTime = Date.now();
        // console.log(`[更新树] 更新完成，时间戳更新为: ${this.lastUpdateTime}`);

        // 即使场景结构没有变化，也要检查选中节点是否存在，并更新详情
        if (this.selectedNode) {
            const nodeExists = this.findNodeByUUID(scene, this.selectedNode.uuid);
            if (nodeExists) {
                // 只更新详情面板，不重建树结构
                // console.log(`[更新树] 选中节点存在，更新详情面板: ${this.selectedNode.name}(${this.selectedNode.uuid})`);
                this.updateDetails();
            } else {
                // 节点已被删除，清除选择
                // console.log(`[更新树] 选中节点已不存在，清除选择: ${this.selectedNode.name}(${this.selectedNode.uuid})`);
                this.selectedNode = null;
                this.updateDetails();
            }
        }
    }

    // 增量更新树结构
    private updateNodeTreeIncremental(scene: cc.Node): void {
        // 记录开始时间，用于性能分析
        const updateStartTime = performance.now();
        // console.log(`[增量更新] 开始处理场景: ${scene?.name || 'undefined'}(${scene?.uuid || 'undefined'}), 子节点数: ${scene?.children?.length || 0}`);

        // 首先检查是否是场景节点，场景节点需要特殊处理
        if (!scene || scene === cc.director.getScene()) {
            // 检查是否正在循环更新
            if (this.pendingUpdate) {
                // console.log('[增量更新] 检测到可能的循环更新，跳过本次更新');
                // 允许下一次更新尝试继续
                this.pendingUpdate = false;
                return;
            }
        }

        // 如果未启用增量更新，使用全量更新
        if (!this.performanceConfig.enableIncrementalUpdates) {
            // console.log('[增量更新] 增量更新已禁用，使用全量更新');

            if (this.treeContainer) {
                // 保存当前滚动位置
                const scrollTop = this.treeContainer.scrollTop;

                // 生成新的树HTML
                const newTree = this.generateNodeTree(scene);

                // 更新树内容
                this.treeContainer.innerHTML = newTree;

                // 恢复滚动位置
                this.treeContainer.scrollTop = scrollTop;

                // 如果有选中的节点，恢复选中状态
                if (this.selectedNode) {
                    const item = this.container?.querySelector(`[data-uuid="${this.selectedNode.uuid}"] .node-tree-item`);
                    if (item) {
                        item.classList.add('selected');
                        // console.log(`[增量更新] 恢复选中节点的选中状态: ${this.selectedNode.name}`);
                    } else {
                        // console.log(`[增量更新] 找不到选中节点的DOM元素: ${this.selectedNode.name}`);
                    }
                }
            }
            return;
        }

        // 当前可见的树节点映射
        const visibleNodes = new Map<string, HTMLElement>();

        // 收集当前DOM中的所有节点
        const treeItems = this.treeContainer?.querySelectorAll('li[data-uuid]');
        const itemCount = treeItems?.length || 0;
        // console.log(`[增量更新] 当前DOM中有 ${itemCount} 个节点元素`);

        treeItems?.forEach(item => {
            if (item instanceof HTMLElement && item.dataset.uuid) {
                visibleNodes.set(item.dataset.uuid, item);
            }
        });
        // console.log(`[增量更新] 成功映射 ${visibleNodes.size} 个节点`);

        // 节点计数器和限制
        let updatedNodeCount = 0;
        const maxNodes = this.performanceConfig.maxNodesPerUpdate;
        // console.log(`[增量更新] 每次更新最大节点数限制: ${maxNodes}`);

        // 设置更新超时（防止无限循环）
        const timeoutLimit = Date.now() + 1000; // 1秒超时
        // console.log(`[增量更新] 设置更新超时: ${new Date(timeoutLimit).toISOString()}`);

        // 递归更新节点，返回有变化的节点UUID
        const updateNode = (node: cc.Node, parentElement: HTMLElement): string[] => {
            // 检查是否超时
            if (Date.now() > timeoutLimit) {
                logWarn(`[增量更新:节点] 节点更新超时，中止本次更新`);
                return [];
            }

            // 如果已达到本次更新的节点数限制，返回空数组
            if (updatedNodeCount >= maxNodes) {
                this.pendingUpdate = true; // 标记有待更新的内容
                // console.log(`[增量更新:节点] 已达到节点数限制 (${maxNodes})，标记待更新并中止`);
                return [];
            }

            // 安全检查：确保节点有效
            if (!node || !node.uuid) {
                logWarn(`[增量更新:节点] 节点无效或UUID缺失`);
                return [];
            }

            const nodeUUID = node.uuid;
            // 每次获取节点时，首先在DOM中查找，可能其他递归分支已经创建了此节点
            let nodeElement = visibleNodes.get(nodeUUID);

            // 如果在映射中找不到，尝试在DOM中查找（以防节点被其他分支创建但未加入映射）
            if (!nodeElement) {
                const foundInDOM = parentElement.querySelector(`li[data-uuid="${nodeUUID}"]`);
                if (foundInDOM instanceof HTMLElement) {
                    nodeElement = foundInDOM;
                    logInfo(`[增量更新:节点] ${node.name}(${nodeUUID}) - 在DOM中找到节点但不在映射中，添加到映射`, node);
                    visibleNodes.set(nodeUUID, foundInDOM);
                }
            }

            const changedNodes: string[] = [];
            const isScene = node === cc.director.getScene();
            const nodeName = node.name || '未命名节点';

            // console.log(`[增量更新:节点] 处理${isScene ? '场景' : '节点'}: ${nodeName}(${nodeUUID}), 已有DOM元素: ${!!nodeElement}`);

            // 获取节点激活状态，场景节点特殊处理
            const isNodeActive = node === cc.director.getScene() ? true : (node.active !== undefined ? node.active : true);

            // 检查节点是否发生变化
            try {
                // 生成节点哈希，场景节点特殊处理
                const nodeHash = this.generateSimpleNodeHash(node, isNodeActive);
                const oldHash = nodeElement?.dataset.hash;

                // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 新哈希: ${nodeHash}, 旧哈希: ${oldHash || '无'}`);

                // 节点不存在或发生变化时更新
                if (!nodeElement || nodeHash !== oldHash) {
                    changedNodes.push(nodeUUID);
                    updatedNodeCount++; // 增加已更新节点计数
                    // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 需要更新, 当前已更新 ${updatedNodeCount}/${maxNodes} 个节点`);

                    // 如果节点不存在，创建新节点
                    if (!nodeElement) {
                        // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 创建新节点元素`);
                        // 注意：generateNodeItem会自动创建子节点容器
                        const newNodeHtml = this.generateNodeItem(node, isNodeActive);
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = newNodeHtml;
                        const newNode = tempDiv.firstElementChild as HTMLElement;


                        // 如果有子节点，确保展开状态正确
                        if (this.expandedNodes.has(nodeUUID) && newNode) {
                            // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 设置为展开状态`);
                            const toggle = newNode.querySelector('.node-toggle');
                            const children = newNode.querySelector('.node-children');
                            if (toggle) toggle.textContent = '▼';
                            if (children) (children as HTMLElement).style.display = '';
                        }

                        // 添加到父元素
                        const childrenContainer = parentElement.querySelector('ul.node-children');
                        if (childrenContainer) {
                            // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 添加到父容器`);
                            childrenContainer.appendChild(newNode);

                            // 设置哈希值和添加到映射
                            if (newNode) {
                                newNode.dataset.hash = nodeHash;
                                // 同时将新节点添加到可见节点映射，防止重复创建
                                visibleNodes.set(nodeUUID, newNode);
                                // 同时更新原始nodeElement变量，避免后续重复创建
                                nodeElement = newNode;
                            }
                        } else {
                            logWarn(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 找不到父容器 ul.node-children`, { name: nodeName, uuid: nodeUUID });
                        }
                    }
                    // 节点存在但发生变化，更新节点
                    else {
                        // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 更新现有节点`);
                        // 更新节点名称
                        const nameElement = nodeElement.querySelector('.node-name');
                        if (nameElement) {
                            nameElement.textContent = node.name;

                            // 更新激活状态样式
                            if (isNodeActive) {
                                nameElement.classList.remove('inactive-node');
                            } else {
                                nameElement.classList.add('inactive-node');
                            }
                        }

                        // 更新整个节点的激活类
                        if (isNodeActive) {
                            nodeElement.classList.remove('node-inactive');
                        } else {
                            nodeElement.classList.add('node-inactive');
                        }

                        // 检查子节点数量变化
                        const hasChildren = node.children && node.children.length > 0;
                        // 修改选择器，只查询当前节点中的第一级node-toggle，避免选到子节点中的元素
                        const toggleElement = nodeElement.querySelector(':scope > .node-tree-item > .node-toggle') as HTMLElement | null;

                        // 处理展开/折叠按钮
                        if (hasChildren && !toggleElement) {
                            // 添加展开/折叠按钮
                            logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 添加展开/折叠按钮`, { name: nodeName, uuid: nodeUUID });
                            const treeItem = nodeElement.querySelector('.node-tree-item');
                            if (treeItem) {
                                const newToggle = document.createElement('span');
                                newToggle.className = 'node-toggle';
                                newToggle.textContent = this.expandedNodes.has(nodeUUID) ? '▼' : '▶';

                                // 在节点名称前插入
                                const firstChild = treeItem.firstChild;
                                if (firstChild) {
                                    treeItem.insertBefore(newToggle, firstChild);
                                } else {
                                    treeItem.appendChild(newToggle);
                                }
                            }

                            // 确保有子节点容器（仅在没有时创建）
                            let childrenContainer = nodeElement.querySelector('.node-children') as HTMLElement | null;
                            if (!childrenContainer) {
                                logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 添加子节点容器`, { name: nodeName, uuid: nodeUUID });
                                childrenContainer = document.createElement('ul');
                                childrenContainer.className = 'node-children';
                                childrenContainer.style.display = this.expandedNodes.has(nodeUUID) ? '' : 'none';
                                nodeElement.appendChild(childrenContainer);
                            } else {
                                logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 子节点容器已存在，无需添加`, { name: nodeName, uuid: nodeUUID });
                            }
                        } else if (!hasChildren && toggleElement) {
                            // 移除展开/折叠按钮
                            logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 移除展开/折叠按钮`, { name: nodeName, uuid: nodeUUID });
                            toggleElement.remove();

                            // 移除可能存在的空子节点容器
                            const childrenContainer = nodeElement.querySelector('.node-children');
                            if (childrenContainer && childrenContainer.children.length === 0) {
                                logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 移除空子节点容器`, { name: nodeName, uuid: nodeUUID });
                                childrenContainer.remove();
                            }
                        } else if (hasChildren && toggleElement) {
                            // 按钮已存在，确保文本正确
                            toggleElement.textContent = this.expandedNodes.has(nodeUUID) ? '▼' : '▶';
                        }

                        // 更新哈希值
                        nodeElement.dataset.hash = nodeHash;
                    }
                } else {
                    // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 无变化，跳过更新`);
                }
            } catch (error) {
                logNodeError(`[增量更新:节点] 处理节点 ${nodeName}(${nodeUUID}) 时出错`, { name: nodeName, uuid: nodeUUID }, error);
            }

            // 如果已达到本次更新的节点数限制，不继续递归子节点
            if (updatedNodeCount >= maxNodes) {
                this.pendingUpdate = true; // 标记有待更新的内容
                // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 已达到节点限制，不处理子节点`);
                return changedNodes;
            }

            // 递归处理子节点
            try {
                if (!node.children || node.children.length === 0) {
                    // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 没有子节点`);
                    return changedNodes;
                }

                // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 开始处理 ${node.children.length} 个子节点`);

                // 如果nodeElement不存在，先创建它
                let currentNodeElement = nodeElement;
                if (!currentNodeElement) {
                    // 双重检查：再次尝试在DOM中查找节点元素
                    const foundElement = parentElement.querySelector(`li[data-uuid="${nodeUUID}"]`);
                    if (foundElement instanceof HTMLElement) {
                        logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 在开始处理子节点前在DOM中找到节点，使用现有节点`);
                        currentNodeElement = foundElement;
                        // 添加到映射，确保其他递归分支能找到它
                        visibleNodes.set(nodeUUID, foundElement);
                    } else {
                        logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 节点元素不存在，创建节点元素后再处理子节点`);

                        // 创建新节点 - 注意generateNodeItem会同时创建子节点容器
                        const newNodeHtml = this.generateNodeItem(node, isNodeActive);
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = newNodeHtml;
                        const newNode = tempDiv.firstElementChild as HTMLElement;

                        if (!newNode) {
                            logWarn(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 无法创建节点元素，跳过子节点处理`);
                            return changedNodes;
                        }

                        // 获取父级的子节点容器
                        const parentChildrenContainer = parentElement.querySelector('ul.node-children');
                        if (!parentChildrenContainer) {
                            logWarn(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 父元素没有子容器，跳过子节点处理`);
                            return changedNodes;
                        }

                        // 添加新节点到DOM
                        parentChildrenContainer.appendChild(newNode);

                        // 设置哈希值
                        const newNodeHash = this.generateSimpleNodeHash(node, isNodeActive);
                        newNode.dataset.hash = newNodeHash;

                        // 现在使用新创建的节点元素作为父元素
                        currentNodeElement = newNode;
                        updatedNodeCount++; // 计数新创建的节点
                        changedNodes.push(nodeUUID);

                        // 将新创建的节点添加到可见节点映射中，防止后续重复创建
                        visibleNodes.set(nodeUUID, newNode);
                        // 同时更新原始nodeElement变量，避免后续重复创建
                        nodeElement = newNode;
                    }
                }

                // 获取子节点容器 - 此时currentNodeElement已确保存在
                const childrenContainer = currentNodeElement.querySelector('.node-children');
                if (!childrenContainer) {
                    // 这种情况不应该发生，因为generateNodeItem应该已经创建了子节点容器
                    logError(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 找不到子节点容器，这是不应该发生的情况`);
                    return changedNodes;
                }

                if (childrenContainer && node.children && node.children.length > 0) {
                    // 记录当前子节点
                    const existingChildren = new Set<string>();
                    // 修改查询选择器，只选择直接子节点，而不是所有后代节点
                    const existingChildElements = childrenContainer.children;
                    // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - DOM中有 ${existingChildElements.length} 个直接子节点元素`);

                    // 只收集直接子节点的UUID
                    Array.from(existingChildElements).forEach(child => {
                        if (child instanceof HTMLElement && child.dataset.uuid) {
                            existingChildren.add(child.dataset.uuid);
                            // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 收集直接子节点: ${child.querySelector('.node-name')?.textContent || '未知'}(${child.dataset.uuid})`);
                        }
                    });
                    // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 收集到 ${existingChildren.size} 个现有直接子节点UUID`);

                    // 创建一个映射，用于记录每个子节点在DOM中的位置和对应元素
                    const childPositions = new Map<string, { element: HTMLElement, index: number }>();
                    Array.from(existingChildElements).forEach((child, index) => {
                        if (child instanceof HTMLElement && child.dataset.uuid) {
                            childPositions.set(child.dataset.uuid, { element: child, index: index });
                        }
                    });

                    // 递归更新每个子节点
                    for (let i = 0; i < node.children.length; i++) {
                        const childNode = node.children[i];

                        // 安全检查
                        if (!childNode) {
                            logWarn(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 子节点 ${i + 1}/${node.children.length} 为空`);
                            continue;
                        }

                        // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 处理子节点 ${i + 1}/${node.children.length}: ${childNode.name}(${childNode.uuid})`);

                        // 如果已达到节点更新限制，标记待更新并退出
                        if (updatedNodeCount >= maxNodes) {
                            this.pendingUpdate = true;
                            // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 处理子节点时达到节点限制，中断处理`);
                            break;
                        }

                        const childChanges = updateNode(childNode, currentNodeElement);
                        if (childChanges.length > 0) {
                            // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 子节点 ${childNode.name}(${childNode.uuid}) 及其子节点中有 ${childChanges.length} 个发生变化`);
                            changedNodes.push(...childChanges);
                        }

                        // 从现有子节点集合中移除已处理的节点
                        existingChildren.delete(childNode.uuid);
                    }

                    // 修复子节点顺序
                    if (childrenContainer.children.length > 1) {
                        // 确保DOM中的子节点顺序与node.children数组中的顺序一致
                        const orderedChildren = Array.from(node.children)
                            .filter(childNode => childNode && childNode.uuid)
                            .map(childNode => childNode.uuid);

                        // 遍历有序的UUID数组，确保每个节点在DOM中的位置正确
                        for (let i = 0; i < orderedChildren.length; i++) {
                            const uuid = orderedChildren[i];
                            if (!uuid) continue;

                            const childElement = childrenContainer.querySelector(`li[data-uuid="${uuid}"]`);
                            if (childElement && childElement !== childrenContainer.children[i]) {
                                // 如果节点存在但顺序不对，则移动到正确位置
                                logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 修正子节点顺序: ${childElement.querySelector('.node-name')?.textContent || '未知'}(${uuid})`);

                                // 如果该位置已有其他元素，将当前节点插入到该位置前
                                if (childrenContainer.children[i]) {
                                    childrenContainer.insertBefore(childElement, childrenContainer.children[i]);
                                } else {
                                    // 如果到达末尾，则直接添加
                                    childrenContainer.appendChild(childElement);
                                }
                                changedNodes.push(uuid);
                            }
                        }
                    }

                    // 移除不再存在的子节点（如果未达到节点更新限制）
                    if (updatedNodeCount < maxNodes && existingChildren.size > 0) {
                        // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 有 ${existingChildren.size} 个子节点需要移除`);

                        let removedCount = 0;
                        existingChildren.forEach(uuid => {
                            const childToRemove = childrenContainer.querySelector(`li[data-uuid="${uuid}"]`);
                            if (childToRemove) {
                                const childName = (childToRemove.querySelector('.node-name')?.textContent || '未知节点');
                                // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 移除子节点: ${childName}(${uuid})`);
                                childToRemove.remove();
                                changedNodes.push(uuid);
                                updatedNodeCount++;
                                removedCount++;
                            }
                        });
                        // console.log(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 成功移除 ${removedCount} 个子节点`);
                    }
                } else {
                    // 有子节点但找不到子节点容器时，创建新容器
                    logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 有子节点但找不到子节点容器，创建新容器`, { name: nodeName, uuid: nodeUUID });

                    // 找到或创建当前节点元素
                    let currentNodeElement: HTMLElement | null = nodeElement || null;
                    if (!currentNodeElement) {
                        // 首先检查可见节点映射中是否已经存在这个节点
                        if (visibleNodes.has(nodeUUID)) {
                            currentNodeElement = visibleNodes.get(nodeUUID) || null;
                            logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 节点已存在于映射中，使用现有节点`);
                        }

                        // 如果映射中没有，全面检查DOM中是否存在此节点
                        if (!currentNodeElement) {
                            // 首先尝试在整个树容器中查找节点，避免重复创建
                            const foundInTree = this.treeContainer?.querySelector(`li[data-uuid="${nodeUUID}"]`);
                            if (foundInTree instanceof HTMLElement) {
                                logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 在整个树中找到节点，使用现有节点`);
                                currentNodeElement = foundInTree;
                                // 添加到映射
                                visibleNodes.set(nodeUUID, foundInTree);
                            } else {
                                // 只在父元素中查找
                                const foundElement = parentElement.querySelector(`li[data-uuid="${nodeUUID}"]`);
                                if (foundElement instanceof HTMLElement) {
                                    logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 在父元素中找到了节点元素，使用现有节点`);
                                    currentNodeElement = foundElement;
                                    // 添加到映射
                                    visibleNodes.set(nodeUUID, foundElement);
                                } else {
                                    // 如果找不到当前节点元素，才创建新节点
                                    logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 找不到节点元素，创建新节点`);
                                    const newNodeHtml = this.generateNodeItem(node, isNodeActive);
                                    const tempDiv = document.createElement('div');
                                    tempDiv.innerHTML = newNodeHtml;
                                    const newElement = tempDiv.firstElementChild;

                                    if (newElement instanceof HTMLElement) {
                                        currentNodeElement = newElement;
                                        // 添加到映射
                                        visibleNodes.set(nodeUUID, newElement);
                                        // 同时更新原始nodeElement变量，避免后续重复创建
                                        nodeElement = newElement;

                                        // 添加到父元素
                                        const parentChildrenContainer = parentElement.querySelector('ul.node-children');
                                        if (parentChildrenContainer) {
                                            parentChildrenContainer.appendChild(currentNodeElement);
                                            changedNodes.push(nodeUUID);
                                            updatedNodeCount++;
                                        } else {
                                            logWarn(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 找不到父节点的子节点容器`);
                                            return changedNodes;
                                        }
                                    } else {
                                        logWarn(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 创建的新节点元素无效`);
                                        return changedNodes;
                                    }
                                }
                            }
                        }
                    }

                    // 此时currentNodeElement已确保是HTMLElement
                    if (!currentNodeElement) {
                        logError(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 节点元素仍然不存在，无法继续处理`);
                        return changedNodes;
                    }

                    // 再次检查是否已有子节点容器（避免重复创建）
                    let foundChildrenContainer = currentNodeElement.querySelector('.node-children');

                    if (foundChildrenContainer instanceof HTMLElement) {
                        logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 节点已有子节点容器，无需创建新容器`);
                        // 使用现有容器，无需创建新的
                    } else {
                        // 只有在确认没有子节点容器时才创建新容器
                        logInfo(`[增量更新:节点] ${nodeName}(${nodeUUID}) - 确认没有子节点容器，创建新容器`);
                        const childrenContainer = document.createElement('ul');
                        childrenContainer.className = 'node-children';

                        // 如果节点是展开状态，确保新容器也是展开的
                        if (this.expandedNodes.has(nodeUUID)) {
                            childrenContainer.style.display = '';
                        } else {
                            childrenContainer.style.display = 'none';
                        }

                        currentNodeElement.appendChild(childrenContainer);
                        // 更新foundChildrenContainer，避免后续再次查询
                        foundChildrenContainer = childrenContainer;
                    }

                    // 设置节点哈希
                    const nodeHash = this.generateSimpleNodeHash(node, isNodeActive);
                    currentNodeElement.dataset.hash = nodeHash;

                    // 递归处理子节点
                    if (updatedNodeCount < maxNodes) {
                        // 使用已找到或新创建的子节点容器
                        const childrenContainer = foundChildrenContainer as HTMLElement;

                        // 递归处理子节点
                        for (let i = 0; i < node.children.length && updatedNodeCount < maxNodes; i++) {
                            const childNode = node.children[i];
                            if (!childNode) continue;

                            const childChanges = updateNode(childNode, currentNodeElement);
                            if (childChanges.length > 0) {
                                changedNodes.push(...childChanges);
                            }
                        }

                        // 如果还有更多子节点但已达到限制，标记待更新
                        if (updatedNodeCount >= maxNodes && node.children.length > 0) {
                            this.pendingUpdate = true;
                        }
                    } else {
                        this.pendingUpdate = true;
                    }
                }
            } catch (error) {
                logNodeError(`[增量更新:节点] 处理节点 ${nodeName}(${nodeUUID}) 的子节点时出错`, { name: nodeName, uuid: nodeUUID }, error);
            }

            return changedNodes;
        };

        // 从场景根节点开始增量更新
        if (this.treeContainer) {
            const rootList = this.treeContainer.querySelector('.node-tree') as HTMLElement;
            if (rootList) {
                try {
                    // console.log(`[增量更新] 找到树根元素，开始递归更新`);
                    const startTime = performance.now();
                    const changedNodes = updateNode(scene, rootList.parentElement || this.treeContainer);
                    const endTime = performance.now();

                    if (changedNodes.length > 0) {
                        // console.log(`[增量更新] 增量更新了 ${changedNodes.length} 个节点，耗时: ${(endTime - startTime).toFixed(2)}ms`);

                        // 如果有待更新内容，记录日志
                        if (this.pendingUpdate) {
                            // console.log(`[增量更新] 达到最大节点限制 (${maxNodes})，剩余节点将在下次更新`);
                        }

                        // 如果有选中的节点，确保其选中状态保持
                        if (this.selectedNode) {
                            const item = this.container?.querySelector(`[data-uuid="${this.selectedNode.uuid}"] .node-tree-item`);
                            if (item) {
                                item.classList.add('selected');
                                // console.log(`[增量更新] 恢复选中节点的选中状态: ${this.selectedNode.name}`);
                            } else {
                                // console.log(`[增量更新] 找不到选中节点的DOM元素: ${this.selectedNode.name}`);
                            }
                        }
                    } else {
                        // console.log(`[增量更新] 没有节点需要更新`);
                    }

                    // 打印总耗时
                    const totalTime = performance.now() - updateStartTime;
                    // console.log(`[增量更新] 整个增量更新过程耗时: ${totalTime.toFixed(2)}ms`);
                } catch (error) {
                    logError('[增量更新] 增量更新失败，错误:', error);

                    // 出错时重置pendingUpdate标记
                    this.pendingUpdate = false;
                }
            } else {
                logWarn('[增量更新] 找不到树根元素');
            }
        } else {
            logWarn('[增量更新] treeContainer不存在');
        }
    }

    // 生成简化版节点哈希，只包含用于UI显示的属性
    private generateSimpleNodeHash(node: cc.Node, isActive?: boolean): string {
        // 检查是否是场景节点
        const isScene = node === cc.director.getScene();

        // 对于场景节点，active总是true
        const active = isActive !== undefined ? isActive :
            (isScene ? true : (node.active !== undefined ? node.active : true));

        // 简化的哈希只包含名称、激活状态和子节点数量
        const hash = `${node.name}:${active ? 1 : 0}:${node.children?.length || 0}`;
        // console.log(`[生成哈希] ${isScene ? '场景' : '节点'}: ${node.name}(${node.uuid}), 哈希: ${hash}`);
        return hash;
    }

    // 强制刷新树结构的方法
    private forceRefreshTree(): void {
        // console.log('强制刷新树结构...');

        // 保存当前选中的节点UUID
        const selectedUUID = this.selectedNode?.uuid;

        // 如果是在自动更新模式下，先暂停自动更新
        const wasInAutoMode = this.syncMode === SyncMode.AUTO;
        if (wasInAutoMode) {
            this.stopAutoUpdate();
        }

        // 清除当前树的渲染缓存
        if (this.treeContainer) {
            // 移除所有节点的哈希值，以强制重新渲染
            const nodeElements = this.treeContainer.querySelectorAll('li[data-uuid]');
            nodeElements.forEach(node => {
                if (node instanceof HTMLElement) {
                    delete node.dataset.hash;
                }
            });
        }

        // 立即更新树结构
        const scene = cc.director.getScene();
        if (scene && this.treeContainer) {
            this.updateNodeTreeIncremental(scene);
        }

        // 如果之前有选中的节点但现在没有，尝试重新选择
        if (selectedUUID && !this.selectedNode) {
            const scene = cc.director.getScene();
            if (scene) {
                const node = this.findNodeByUUID(scene, selectedUUID);
                if (node) {
                    this.selectNode(selectedUUID);
                }
            }
        }

        // 如果之前是自动模式，恢复自动更新
        if (wasInAutoMode) {
            this.startAutoUpdate();
        }
    }

    private refreshSceneView(): void {
        // 实现刷新场景视图的逻辑
        // console.log('[场景更新] 开始刷新场景视图...');

        // 尝试通过修改节点的位置后再恢复，来触发节点的刷新
        if (this.selectedNode) {
            const node = this.selectedNode;

            try {
                // 如果节点是active的，我们可以通过修改位置来触发更新
                if (node.active) {
                    // 记录原始位置
                    const originalPosition = {
                        x: node.position?.x || 0,
                        y: node.position?.y || 0,
                        z: node.position?.z || 0
                    };

                    // 临时修改并恢复位置，触发引擎更新渲染
                    if (node.position) {
                        // 缓存原始值
                        const originalX = node.position.x;

                        // 稍微改变然后恢复，以触发引擎更新
                        node.position.x = originalX + 0.0001;
                        // 立即恢复原值
                        node.position.x = originalX;

                        // console.log(`[场景更新] 通过position属性触发场景刷新, 节点: ${node.name}(${node.uuid})`);
                    }
                }
                // 对于已禁用的节点，我们尝试通过父节点触发更新
                else if (node.parent && node.parent.active) {
                    // console.log(`[场景更新] 节点已禁用，尝试通过父节点触发更新: ${node.name}(${node.uuid}), 父节点: ${node.parent.name}(${node.parent.uuid})`);

                    // 记录父节点原始位置
                    const parentNode = node.parent;
                    const originalParentX = parentNode.position?.x || 0;

                    if (parentNode.position) {
                        // 微调父节点位置然后恢复
                        parentNode.position.x = originalParentX + 0.0001;
                        parentNode.position.x = originalParentX;

                        // console.log(`[场景更新] 通过父节点position属性触发场景刷新: ${parentNode.name}(${parentNode.uuid})`);
                    }
                }
                // 如果节点和父节点都被禁用，尝试通过触发场景事件刷新
                else {
                    // console.log(`[场景更新] 节点及其父节点均已禁用，尝试触发场景事件: ${node.name}(${node.uuid})`);

                    // 获取场景根节点
                    const scene = cc.director.getScene();
                    if (scene) {
                        // 尝试触发场景更新
                        try {
                            // 尝试触发场景中某个活跃节点的位置变化
                            if (this.triggerSceneUpdate(scene)) {
                                // console.log(`[场景更新] 成功通过活跃节点触发场景更新, 目标节点: ${node.name}(${node.uuid})`);
                            } else {
                                // console.log(`[场景更新] 未找到可用的活跃节点来触发更新, 目标节点: ${node.name}(${node.uuid})`);
                            }
                        } catch (e) {
                            logError(`[场景更新] 触发场景更新失败, 目标节点: ${node.name}(${node.uuid})`, e);
                        }
                    }
                }

                // 额外记录日志，确认场景刷新尝试
                // console.log(`[场景更新] 尝试刷新节点完成: ${node.name}(${node.uuid}), active: ${node.active}`);
            } catch (error) {
                logError(`[场景更新] 刷新场景视图失败, 节点: ${node.name}(${node.uuid})`, error);
            }
        } else {
            // console.log(`[场景更新] 无选中节点，跳过场景刷新`);
        }
    }

    // 递归查找一个活跃节点并触发其更新
    private triggerSceneUpdate(node: cc.Node): boolean {
        // 如果节点处于激活状态且有位置属性，触发位置更新
        if (node.active && node.position) {
            const origX = node.position.x;
            node.position.x = origX + 0.0001;
            node.position.x = origX;
            // console.log(`[场景更新] 通过激活节点触发场景更新: ${node.name}(${node.uuid})`);
            return true;
        }

        // 递归查找子节点
        if (node.children && node.children.length > 0) {
            for (const child of node.children) {
                if (this.triggerSceneUpdate(child)) {
                    return true;
                }
            }
        }

        return false;
    }

    // 显示性能设置面板
    private showPerformanceSettings(): void {
        // 检查是否已有设置面板
        let settingsPanel = document.querySelector('.performance-settings-panel');
        if (settingsPanel) {
            settingsPanel.remove();
            return;
        }

        // 创建设置面板
        settingsPanel = document.createElement('div');
        settingsPanel.className = 'performance-settings-panel';

        // 设置HTML内容
        settingsPanel.innerHTML = `
            <div class="settings-header">
                <h4>性能设置</h4>
                <button class="close-btn">×</button>
            </div>
            <div class="settings-content">
                <div class="setting-item">
                    <label>刷新间隔 (ms)</label>
                    <input type="range" min="100" max="1000" step="50" 
                           value="${this.updateInterval}" id="update-interval">
                    <span>${this.updateInterval}ms</span>
                </div>
                <div class="setting-item">
                    <label>节流阈值 (ms)</label>
                    <input type="range" min="50" max="500" step="25" 
                           value="${this.performanceConfig.updateThrottleMs}" id="throttle-threshold">
                    <span>${this.performanceConfig.updateThrottleMs}ms</span>
                </div>
                <div class="setting-item">
                    <label>每次更新最大节点数</label>
                    <input type="range" min="10" max="200" step="10" 
                           value="${this.performanceConfig.maxNodesPerUpdate}" id="max-nodes">
                    <span>${this.performanceConfig.maxNodesPerUpdate}</span>
                </div>
                <div class="setting-item">
                    <label>启用增量更新</label>
                    <input type="checkbox" id="enable-incremental" 
                           ${this.performanceConfig.enableIncrementalUpdates ? 'checked' : ''}>
                </div>
                <div class="setting-actions">
                    <button id="apply-settings">应用</button>
                    <button id="reset-settings">重置</button>
                </div>
            </div>
        `;

        // 添加到DOM
        document.body.appendChild(settingsPanel);

        // 添加事件监听
        // 关闭按钮
        const closeBtn = settingsPanel.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => settingsPanel?.remove());
        }

        // 更新显示值
        const updateInterval = settingsPanel.querySelector('#update-interval') as HTMLInputElement;
        const updateIntervalDisplay = updateInterval?.nextElementSibling as HTMLElement;
        updateInterval?.addEventListener('input', () => {
            if (updateIntervalDisplay) {
                updateIntervalDisplay.textContent = `${updateInterval.value}ms`;
            }
        });

        const throttleThreshold = settingsPanel.querySelector('#throttle-threshold') as HTMLInputElement;
        const throttleDisplay = throttleThreshold?.nextElementSibling as HTMLElement;
        throttleThreshold?.addEventListener('input', () => {
            if (throttleDisplay) {
                throttleDisplay.textContent = `${throttleThreshold.value}ms`;
            }
        });

        const maxNodes = settingsPanel.querySelector('#max-nodes') as HTMLInputElement;
        const maxNodesDisplay = maxNodes?.nextElementSibling as HTMLElement;
        maxNodes?.addEventListener('input', () => {
            if (maxNodesDisplay) {
                maxNodesDisplay.textContent = maxNodes.value;
            }
        });

        // 应用按钮
        const applyBtn = settingsPanel.querySelector('#apply-settings');
        applyBtn?.addEventListener('click', () => {
            // 获取设置值
            const newUpdateInterval = parseInt(updateInterval?.value || '200');
            const newThrottleThreshold = parseInt(throttleThreshold?.value || '100');
            const newMaxNodes = parseInt(maxNodes?.value || '50');
            const enableIncremental = (settingsPanel?.querySelector('#enable-incremental') as HTMLInputElement)?.checked || false;

            // 更新配置
            this.updateInterval = newUpdateInterval;
            this.performanceConfig = {
                updateThrottleMs: newThrottleThreshold,
                maxNodesPerUpdate: newMaxNodes,
                enableIncrementalUpdates: enableIncremental
            };

            // 如果在自动更新模式，重启更新定时器
            if (this.syncMode === SyncMode.AUTO) {
                this.startAutoUpdate();
            }

            logInfo('应用新性能设置:', { performanceConfig: this.performanceConfig });

            // 关闭面板
            settingsPanel?.remove();
        });

        // 重置按钮
        const resetBtn = settingsPanel.querySelector('#reset-settings');
        resetBtn?.addEventListener('click', () => {
            // 重置为默认值
            if (updateInterval) updateInterval.value = '200';
            if (updateIntervalDisplay) updateIntervalDisplay.textContent = '200ms';

            if (throttleThreshold) throttleThreshold.value = '100';
            if (throttleDisplay) throttleDisplay.textContent = '100ms';

            if (maxNodes) maxNodes.value = '50';
            if (maxNodesDisplay) maxNodesDisplay.textContent = '50';

            const incrementalCheckbox = settingsPanel?.querySelector('#enable-incremental') as HTMLInputElement;
            if (incrementalCheckbox) incrementalCheckbox.checked = true;
        });
    }

    // 显示更新指示器
    private showUpdatingIndicator(): void {
        // 移除现有指示器
        this.hideUpdatingIndicator();

        // 创建新指示器
        if (this.container) {
            const indicator = document.createElement('div');
            indicator.className = 'updating-indicator';
            indicator.textContent = '正在更新...';
            indicator.id = 'updating-indicator';
            this.container.appendChild(indicator);

            // 2秒后自动移除
            setTimeout(() => this.hideUpdatingIndicator(), 2000);
        }
    }

    // 隐藏更新指示器
    private hideUpdatingIndicator(): void {
        if (this.container) {
            const indicator = this.container.querySelector('#updating-indicator');
            if (indicator) {
                indicator.remove();
            }
        }
    }

    // 显示错误指示器
    private showErrorIndicator(message: string): void {
        // 移除现有指示器
        this.hideErrorIndicator();

        // 创建新指示器
        if (this.container) {
            const indicator = document.createElement('div');
            indicator.className = 'error-indicator';
            indicator.textContent = message;
            indicator.id = 'error-indicator';

            // 添加点击事件，点击后尝试重新开始更新
            indicator.addEventListener('click', () => {
                this.hideErrorIndicator();
                this.startAutoUpdate();
            });

            this.container.appendChild(indicator);
        }
    }

    // 隐藏错误指示器
    private hideErrorIndicator(): void {
        if (this.container) {
            const indicator = this.container.querySelector('#error-indicator');
            if (indicator) {
                indicator.remove();
            }
        }
    }

    // 添加showLogSettings方法
    private showLogSettings(): void {
        // 检查是否已有设置面板
        let settingsPanel = document.querySelector('.log-settings-panel');
        if (settingsPanel) {
            settingsPanel.remove();
            return;
        }

        // 创建设置面板
        settingsPanel = document.createElement('div');
        settingsPanel.className = 'log-settings-panel';

        // 获取当前日志级别
        const currentLevel = log.getCurrentLevel();

        // 设置HTML内容
        settingsPanel.innerHTML = `
            <div class="settings-header">
                <h4>日志设置</h4>
                <button class="close-btn">×</button>
            </div>
            <div class="settings-content">
                <div class="setting-item">
                    <label>全局日志级别</label>
                    <select id="global-log-level">
                        <option value="0" ${currentLevel === 0 ? 'selected' : ''}>DEBUG</option>
                        <option value="1" ${currentLevel === 1 ? 'selected' : ''}>INFO</option>
                        <option value="2" ${currentLevel === 2 ? 'selected' : ''}>WARN</option>
                        <option value="3" ${currentLevel === 3 ? 'selected' : ''}>ERROR</option>
                        <option value="4" ${currentLevel === 4 ? 'selected' : ''}>NONE</option>
                    </select>
                </div>
                <div class="setting-item">
                    <label>单独控制日志级别</label>
                    <div class="log-level-controls">
                        <div class="log-level-item">
                            <label>
                                <input type="checkbox" id="debug-enabled" 
                                    ${log.isLevelEnabled(0) ? 'checked' : ''}>
                                DEBUG
                            </label>
                        </div>
                        <div class="log-level-item">
                            <label>
                                <input type="checkbox" id="info-enabled" 
                                    ${log.isLevelEnabled(1) ? 'checked' : ''}>
                                INFO
                            </label>
                        </div>
                        <div class="log-level-item">
                            <label>
                                <input type="checkbox" id="warn-enabled" 
                                    ${log.isLevelEnabled(2) ? 'checked' : ''}>
                                WARN
                            </label>
                        </div>
                        <div class="log-level-item">
                            <label>
                                <input type="checkbox" id="error-enabled" 
                                    ${log.isLevelEnabled(3) ? 'checked' : ''}>
                                ERROR
                            </label>
                        </div>
                    </div>
                </div>
                <div class="setting-actions">
                    <button id="apply-log-settings">应用</button>
                    <button id="reset-log-settings">重置</button>
                </div>
            </div>
        `;

        // 添加CSS样式
        const style = document.createElement('style');
        style.textContent = `
            .log-settings-panel {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                z-index: 10000;
                min-width: 300px;
            }
            .log-settings-panel .settings-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            .log-settings-panel .close-btn {
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                padding: 0 5px;
            }
            .log-settings-panel .setting-item {
                margin-bottom: 15px;
            }
            .log-settings-panel .setting-item label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
            }
            .log-settings-panel select {
                width: 100%;
                padding: 5px;
                margin-bottom: 10px;
            }
            .log-settings-panel .log-level-controls {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
            }
            .log-settings-panel .log-level-item {
                display: flex;
                align-items: center;
            }
            .log-settings-panel .log-level-item label {
                font-weight: normal;
                margin: 0;
            }
            .log-settings-panel .setting-actions {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 20px;
            }
            .log-settings-panel button {
                padding: 5px 15px;
                cursor: pointer;
            }
            .log-settings-btn {
                margin-left: 10px;
                padding: 5px 10px;
                background: #4CAF50;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            .log-settings-btn:hover {
                background: #45a049;
            }
        `;
        document.head.appendChild(style);

        // 添加到DOM
        document.body.appendChild(settingsPanel);

        // 添加事件监听
        // 关闭按钮
        const closeBtn = settingsPanel.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => settingsPanel?.remove());
        }

        // 应用按钮
        const applyBtn = settingsPanel.querySelector('#apply-log-settings');
        applyBtn?.addEventListener('click', () => {
            // 获取全局日志级别
            const globalLevel = parseInt((settingsPanel?.querySelector('#global-log-level') as HTMLSelectElement)?.value || '1');
            log.setLevel(globalLevel);

            // 获取各个级别的启用状态
            const debugEnabled = (settingsPanel?.querySelector('#debug-enabled') as HTMLInputElement)?.checked;
            const infoEnabled = (settingsPanel?.querySelector('#info-enabled') as HTMLInputElement)?.checked;
            const warnEnabled = (settingsPanel?.querySelector('#warn-enabled') as HTMLInputElement)?.checked;
            const errorEnabled = (settingsPanel?.querySelector('#error-enabled') as HTMLInputElement)?.checked;

            // 应用各个级别的启用状态
            if (debugEnabled) log.enableLevel(0); else log.disableLevel(0);
            if (infoEnabled) log.enableLevel(1); else log.disableLevel(1);
            if (warnEnabled) log.enableLevel(2); else log.disableLevel(2);
            if (errorEnabled) log.enableLevel(3); else log.disableLevel(3);

            logInfo('日志设置已更新', {
                globalLevel,
                enabledLevels: {
                    DEBUG: debugEnabled,
                    INFO: infoEnabled,
                    WARN: warnEnabled,
                    ERROR: errorEnabled
                }
            });

            // 关闭面板
            settingsPanel?.remove();
        });

        // 重置按钮
        const resetBtn = settingsPanel.querySelector('#reset-log-settings');
        resetBtn?.addEventListener('click', () => {
            // 使用LogManager的重置功能
            log.resetSettings();

            // 更新UI显示
            const settings: LogSettings = log.getSettings();

            // 更新全局级别选择
            const globalLevelSelect = settingsPanel?.querySelector('#global-log-level') as HTMLSelectElement;
            if (globalLevelSelect) {
                globalLevelSelect.value = settings.currentLevel.toString();
            }

            // 更新各个级别的启用状态
            const debugCheckbox = settingsPanel?.querySelector('#debug-enabled') as HTMLInputElement;
            const infoCheckbox = settingsPanel?.querySelector('#info-enabled') as HTMLInputElement;
            const warnCheckbox = settingsPanel?.querySelector('#warn-enabled') as HTMLInputElement;
            const errorCheckbox = settingsPanel?.querySelector('#error-enabled') as HTMLInputElement;

            if (debugCheckbox) debugCheckbox.checked = settings.levelEnabled[LogLevel.DEBUG];
            if (infoCheckbox) infoCheckbox.checked = settings.levelEnabled[LogLevel.INFO];
            if (warnCheckbox) warnCheckbox.checked = settings.levelEnabled[LogLevel.WARN];
            if (errorCheckbox) errorCheckbox.checked = settings.levelEnabled[LogLevel.ERROR];

            // 记录重置操作
            logInfo('日志设置已重置为默认值', { settings });
        });
    }
}

// 自动初始化
new CocosInspector(); 