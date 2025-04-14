/// <reference path="./types/cocos.d.ts" />

import { RendererManager } from './renderers/RendererManager';

// 同步模式枚举
enum SyncMode {
    AUTO = 'auto',
    MANUAL = 'manual'
}

class CocosInspector {
    private container: HTMLElement | null = null;
    private selectedNode: cc.Node | null = null;
    private syncMode: SyncMode = SyncMode.AUTO;
    private updateIntervalId: number | null = null;
    private updateInterval: number = 100; // 默认100ms刷新率，与Cocos Creator接近
    private isCollapsed: boolean = false; // 是否折叠
    private lastWidth: number = 600; // 记住最后的宽度，从300px增加到600px
    private rendererManager: RendererManager; // 组件渲染器管理器
    private treeContainer: HTMLElement | null = null; // 树形结构容器
    private detailsContainer: HTMLElement | null = null; // 详细信息容器
    private expandedNodes: Set<string> = new Set(); // 存储已展开节点的UUID
    private expandedComponents: Set<string> = new Set(); // 存储已展开组件的UUID
    private treeSnapshot: string = ''; // 存储树结构的快照
    private sceneStructureHash: string = ''; // 存储场景结构的哈希值

    constructor() {
        this.rendererManager = new RendererManager();
        this.init();
    }

    private init(): void {
        // 等待cc对象加载
        if (typeof cc === 'undefined' || !cc.director || !cc.director.getScene) {
            setTimeout(() => this.init(), 500);
            return;
        }

        this.createUI();
        this.initTree();
        this.startUpdate();
    }

    private createUI(): void {
        this.container = document.createElement('div');
        this.container.className = 'cocos-inspector';

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

        // 立即更新一次
        this.updateTree();

        // 创建新的定时器
        this.updateIntervalId = window.setInterval(() => this.updateTree(), this.updateInterval) as unknown as number;
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

        if (this.treeContainer) {
            this.treeContainer.innerHTML = this.generateNodeTree(scene);
        }
    }

    private generateNodeTree(node: cc.Node): string {
        let html = '<ul class="node-tree">';
        html += this.generateNodeItem(node);
        html += '</ul>';
        return html;
    }

    private generateNodeItem(node: cc.Node): string {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = this.expandedNodes.has(node.uuid);
        const toggleClass = hasChildren ? 'node-toggle' : 'node-toggle-empty';
        const toggleText = hasChildren ? (isExpanded ? '▼' : '▶') : '';
        const childrenStyle = isExpanded ? '' : 'display: none;';

        let html = `
            <li data-uuid="${node.uuid}">
                <div class="node-tree-item">
                    <span class="${toggleClass}">${toggleText}</span>
                    <span class="node-name">${node.name}</span>
                </div>
        `;

        if (hasChildren) {
            html += `<ul class="node-children" style="${childrenStyle}">`;
            node.children.forEach(child => {
                html += this.generateNodeItem(child);
            });
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

            console.log(`属性变更: ${property}, 节点: ${this.selectedNode.name}(${this.selectedNode.uuid})`);

            // 首先检查节点是否有此属性
            const hasProperty = property.includes('.')
                ? this.checkNestedProperty(this.selectedNode, property)
                : property in this.selectedNode;

            if (!hasProperty) {
                console.warn(`节点不包含属性: ${property}`);
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

                    // 通知场景节点状态发生变化
                    if (window.cc && window.cc.director && window.cc.director.getScene) {
                        // 强制更新场景，确保active状态变化立即显示
                        const scene = window.cc.director.getScene();
                        if (scene) {
                            // 触发场景更新
                            this.refreshSceneView();
                        }
                    }

                    // 先刷新当前节点的详情
                    this.updateDetails();
                    // 短暂延迟后刷新整个树，让用户能看到即时效果
                    setTimeout(() => this.forceRefreshTree(), 300);
                }
            } else {
                // 数字或文本
                let value: any = inputElement.value;

                // 对于数字输入，转换为数值
                if (inputElement.classList.contains('property-number')) {
                    value = parseFloat(value);
                    if (isNaN(value)) return;
                }

                console.log(`更新属性值: ${property} = ${value}`);
                this.updateNodeProperty(this.selectedNode, property, value);

                // 如果修改的是节点名称，需要更新树视图
                if (property === 'name') {
                    // 短暂延迟后刷新整个树
                    setTimeout(() => this.forceRefreshTree(), 300);
                }
            }

            // 如果在自动更新模式下，马上更新面板
            if (this.syncMode === SyncMode.AUTO) {
                this.updateDetails();
            }

            // 检查是否修改了变换属性（position、eulerAngles或scale），需要刷新场景视图
            if (property.startsWith('position') || property.startsWith('eulerAngles') || property.startsWith('scale')) {
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
                        console.log(`更新嵌套属性: ${property}, 旧值: ${oldValue}, 新值: ${value}`);
                    } else {
                        console.warn(`对象 ${mainProp} 不包含子属性: ${subProp}`);
                    }
                } else {
                    console.warn(`节点不包含有效对象属性: ${mainProp}`);
                }
            } else {
                // 确保属性存在
                if (property in node) {
                    const oldValue = (node as any)[property];
                    (node as any)[property] = value;
                    console.log(`更新属性: ${property}, 旧值: ${oldValue}, 新值: ${value}`);
                } else {
                    console.warn(`节点不包含属性: ${property}`);
                }
            }

            // 如果在自动更新模式下，马上更新面板
            if (this.syncMode === SyncMode.AUTO) {
                this.updateDetails();
            }
        } catch (error) {
            console.error('更新属性失败:', error);
        }
    }

    private selectNode(uuid: string): void {
        // 移除之前的选中状态
        const selected = this.container?.querySelector('.node-tree-item.selected');
        if (selected) selected.classList.remove('selected');

        // 添加新的选中状态
        const item = this.container?.querySelector(`[data-uuid="${uuid}"] .node-tree-item`);
        if (item) item.classList.add('selected');

        // 更新选中的节点
        const scene = cc.director.getScene();
        this.selectedNode = this.findNodeByUUID(scene, uuid);

        // 更新详细信息面板
        this.updateDetails();

        console.log('Selected node:', this.selectedNode);
    }

    private updateDetails(): void {
        if (!this.detailsContainer || !this.selectedNode) return;

        // 获取节点的所有组件
        const components = this.selectedNode._components || [];

        // 添加一个伪组件用于显示Transform信息
        const transformComponent = {
            uuid: 'transform_' + this.selectedNode.uuid,
            node: this.selectedNode,
            enabled: true,
            constructor: { name: 'Transform' }
        } as cc.Component;

        const allComponents = [transformComponent, ...components];

        // 记住当前滚动位置
        const scrollTop = this.detailsContainer.scrollTop;

        // 使用渲染器管理器渲染组件
        this.detailsContainer.innerHTML = this.rendererManager.renderComponents(allComponents);

        // 应用保存的组件展开状态
        this.applyComponentExpandState();

        // 恢复滚动位置
        this.detailsContainer.scrollTop = scrollTop;
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

        // 添加节点基本属性
        hash += `:${node.active ? 1 : 0}`; // 活动状态

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
        if (!scene) return;

        // 检查场景结构是否发生变化
        const sceneChanged = this.hasSceneStructureChanged(scene);

        // 只在场景结构发生变化时更新树
        if (sceneChanged && this.treeContainer) {
            console.log('Scene structure changed, updating tree...');

            // 生成新的树HTML
            const newTree = this.generateNodeTree(scene);

            // 保存当前滚动位置
            const scrollTop = this.treeContainer.scrollTop;

            // 更新树内容
            this.treeContainer.innerHTML = newTree;

            // 恢复滚动位置
            this.treeContainer.scrollTop = scrollTop;

            // 如果有选中的节点，恢复选中状态
            if (this.selectedNode) {
                const item = this.container?.querySelector(`[data-uuid="${this.selectedNode.uuid}"] .node-tree-item`);
                if (item) {
                    item.classList.add('selected');
                } else {
                    // 如果节点不存在了，清除选择
                    this.selectedNode = null;
                    this.updateDetails();
                }
            }
        }

        // 即使场景结构没有变化，也要检查选中节点是否存在，并更新详情
        if (this.selectedNode) {
            const nodeExists = this.findNodeByUUID(scene, this.selectedNode.uuid);
            if (nodeExists) {
                // 只更新详情面板，不重建树结构
                this.updateDetails();
            } else {
                // 节点已被删除，清除选择
                this.selectedNode = null;
                this.updateDetails();
            }
        }
    }

    // 强制刷新树结构的方法
    private forceRefreshTree(): void {
        // 重置哈希值，确保下次更新时会重建树
        this.sceneStructureHash = '';

        // 保存当前选中的节点UUID
        const selectedUUID = this.selectedNode?.uuid;

        // 立即更新树结构
        this.updateTree();

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
    }

    private refreshSceneView(): void {
        // 实现刷新场景视图的逻辑
        console.log('Refreshing scene view...');

        // 尝试通过修改节点的位置后再恢复，来触发节点的刷新
        if (this.selectedNode) {
            const node = this.selectedNode;

            try {
                // 记录原始位置
                const originalPosition = {
                    x: node.position?.x || 0,
                    y: node.position?.y || 0,
                    z: node.position?.z || 0
                };

                // 临时修改并恢复位置，触发引擎更新渲染
                // 使用简单的方法：直接设置position属性的x值然后恢复
                if (node.position) {
                    // 缓存原始值
                    const originalX = node.position.x;

                    // 稍微改变然后恢复，以触发引擎更新
                    node.position.x = originalX + 0.0001;
                    // 立即恢复原值
                    node.position.x = originalX;

                    console.log('触发场景刷新成功');
                }

                // 额外记录日志，确认场景刷新尝试
                console.log(`刷新节点: ${node.name}, 使用位置属性触发更新`);
            } catch (error) {
                console.error('刷新场景视图失败:', error);
            }
        }
    }
}

// 自动初始化
new CocosInspector(); 