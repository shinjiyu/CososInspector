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

        // 添加按钮点击事件
        autoBtn.addEventListener('click', () => this.setSyncMode(SyncMode.AUTO));
        manualBtn.addEventListener('click', () => this.setSyncMode(SyncMode.MANUAL));
        refreshBtn.addEventListener('click', () => this.updateTree());

        syncControls.appendChild(autoBtn);
        syncControls.appendChild(manualBtn);
        controls.appendChild(syncControls);
        controls.appendChild(refreshBtn);
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
        const toggleClass = hasChildren ? 'node-toggle' : 'node-toggle-empty';
        const toggleText = hasChildren ? '▶' : '';

        let html = `
            <li data-uuid="${node.uuid}">
                <div class="node-tree-item">
                    <span class="${toggleClass}">${toggleText}</span>
                    <span class="node-name">${node.name}</span>
                </div>
        `;

        if (hasChildren) {
            html += '<ul class="node-children">';
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
                const children = li?.querySelector('.node-children') as HTMLElement;
                if (children) {
                    toggle.textContent = toggle.textContent === '▶' ? '▼' : '▶';
                    children.style.display = children.style.display === 'none' ? '' : 'none';
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
                const toggle = componentHeader.querySelector('.component-toggle');
                const componentItem = componentHeader.closest('.component-item');
                const content = componentItem?.querySelector('.component-content');

                if (toggle && content) {
                    toggle.classList.toggle('collapsed');
                    content.classList.toggle('collapsed');
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

            // 根据输入类型处理
            if (inputElement.type === 'checkbox') {
                // 布尔值
                const value = inputElement.checked;
                this.updateNodeProperty(this.selectedNode, property, value);
            } else {
                // 数字或文本
                let value: any = inputElement.value;

                // 对于数字输入，转换为数值
                if (inputElement.classList.contains('property-number')) {
                    value = parseFloat(value);
                    if (isNaN(value)) return;
                }

                this.updateNodeProperty(this.selectedNode, property, value);
            }
        }
    }

    private updateNodeProperty(node: cc.Node, property: string, value: any): void {
        try {
            // 处理嵌套属性，例如 "eulerAngles.x"
            if (property.includes('.')) {
                const parts = property.split('.');
                const mainProp = parts[0];
                const subProp = parts[1];

                if (node[mainProp as keyof cc.Node] && typeof node[mainProp as keyof cc.Node] === 'object') {
                    (node[mainProp as keyof cc.Node] as any)[subProp] = value;
                }
            } else {
                (node as any)[property] = value;
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

        // 使用渲染器管理器渲染组件
        this.detailsContainer.innerHTML = this.rendererManager.renderComponents(allComponents);
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

    private updateTree(): void {
        const scene = cc.director.getScene();
        if (!scene) return;

        // 只在场景变化时更新树结构
        if (this.treeContainer) {
            const newTree = this.generateNodeTree(scene);
            if (this.treeContainer.innerHTML !== newTree) {
                this.treeContainer.innerHTML = newTree;

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
        }

        // 更新选中节点的详细信息
        if (this.selectedNode) {
            // 检查节点是否还存在
            const nodeExists = this.findNodeByUUID(scene, this.selectedNode.uuid);
            if (nodeExists) {
                this.updateDetails();
            } else {
                // 节点已被删除，清除选择
                this.selectedNode = null;
                this.updateDetails();
            }
        }
    }
}

// 自动初始化
new CocosInspector(); 