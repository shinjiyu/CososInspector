/// <reference path="./types/cocos.d.ts" />

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

    constructor() {
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

        this.container.appendChild(header);
        this.container.appendChild(content);
        document.body.appendChild(this.container);
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

        const content = this.container?.querySelector('.cocos-inspector-content');
        if (content) {
            content.innerHTML = this.generateNodeTree(scene);
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
        });

        // 默认开始自动更新
        this.setSyncMode(SyncMode.AUTO);
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
        console.log('Selected node:', this.selectedNode);
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

        // 只在场景变化时更新
        const content = this.container?.querySelector('.cocos-inspector-content');
        if (content) {
            const newTree = this.generateNodeTree(scene);
            if (content.innerHTML !== newTree) {
                content.innerHTML = newTree;
            }
        }
    }
}

// 自动初始化
new CocosInspector(); 