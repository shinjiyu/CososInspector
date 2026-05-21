/// <reference path="./types/cocos.d.ts" />

import { isCocos3, log, waitForCocos3 } from './cocos3/detect';
import {
  buildTreeInfo,
  getSceneRoot,
  hashTree,
  type TreeNodeInfo,
} from './cocos3/sceneTree';

const REFRESH_MS = 500;

class CocosInspector3 {
  private root: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private edgeTab: HTMLButtonElement | null = null;
  private treeContainer: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private statusEl: HTMLElement | null = null;

  private expandedNodes = new Set<string>();
  private selectedId: string | null = null;
  private searchQuery = '';
  private isCollapsed = false;
  private treeHash = '';
  private updateTimer: number | null = null;

  constructor() {
    if (isCocos3()) {
      this.init();
    } else {
      waitForCocos3(() => this.init());
    }
  }

  private init(): void {
    this.createUI();
    this.bindTreeEvents();
    this.refreshTree(true);
    this.startAutoRefresh();

    (window as Window & { CocosInspector3?: CocosInspector3 }).CocosInspector3 =
      this;
    log('已启动（仅节点树，Cocos 3.x）');
  }

  private createUI(): void {
    this.root = document.createElement('div');
    this.root.className = 'cocos-inspector-root';

    this.edgeTab = document.createElement('button');
    this.edgeTab.type = 'button';
    this.edgeTab.className = 'inspector-edge-tab';
    this.edgeTab.textContent = '节点树';
    this.edgeTab.title = '展开 Cocos Inspector';
    this.edgeTab.setAttribute('aria-label', '展开面板');
    this.edgeTab.addEventListener('click', () => this.setCollapsed(false));
    this.root.appendChild(this.edgeTab);

    this.panel = document.createElement('div');
    this.panel.className = 'cocos-inspector-panel';

    const header = document.createElement('div');
    header.className = 'cocos-inspector-header';

    const title = document.createElement('h3');
    title.textContent = 'Cocos Inspector 3';
    header.appendChild(title);

    const version = document.createElement('span');
    version.className = 'engine-version';
    version.textContent = `引擎 ${window.cc.ENGINE_VERSION ?? '3.x'}`;
    header.appendChild(version);

    const controls = document.createElement('div');
    controls.className = 'inspector-controls';

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'refresh-btn';
    refreshBtn.textContent = '刷新';
    refreshBtn.addEventListener('click', () => this.refreshTree(true));
    controls.appendChild(refreshBtn);

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'search';
    this.searchInput.className = 'search-input';
    this.searchInput.placeholder = '搜索节点名称…';
    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput?.value.trim().toLowerCase() ?? '';
      this.refreshTree(true);
    });
    controls.appendChild(this.searchInput);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'header-toggle-btn';
    toggleBtn.textContent = '收起';
    toggleBtn.title = '收起面板';
    toggleBtn.addEventListener('click', () => this.toggleCollapse());
    controls.appendChild(toggleBtn);

    header.appendChild(controls);
    this.panel.appendChild(header);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'inspector-status';
    this.panel.appendChild(this.statusEl);

    this.treeContainer = document.createElement('div');
    this.treeContainer.className = 'node-tree-panel';
    this.panel.appendChild(this.treeContainer);

    this.root.appendChild(this.panel);
    document.body.appendChild(this.root);
  }

  private toggleCollapse(): void {
    this.setCollapsed(!this.isCollapsed);
  }

  private setCollapsed(collapsed: boolean): void {
    if (!this.root) return;
    this.isCollapsed = collapsed;
    this.root.classList.toggle('is-collapsed', collapsed);

    const headerBtn = this.panel?.querySelector(
      '.header-toggle-btn'
    ) as HTMLButtonElement | null;
    if (headerBtn) {
      headerBtn.textContent = collapsed ? '展开' : '收起';
      headerBtn.title = collapsed ? '展开面板' : '收起面板';
    }
  }

  private startAutoRefresh(): void {
    if (this.updateTimer !== null) {
      window.clearInterval(this.updateTimer);
    }
    this.updateTimer = window.setInterval(() => this.refreshTree(false), REFRESH_MS);
  }

  private bindTreeEvents(): void {
    this.treeContainer?.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const toggle = target.closest('.node-toggle');
      const row = target.closest('.node-tree-item');

      if (toggle) {
        const li = toggle.closest('li');
        const id = li?.dataset.uuid;
        if (!id) return;

        if (this.expandedNodes.has(id)) {
          this.expandedNodes.delete(id);
        } else {
          this.expandedNodes.add(id);
        }
        this.refreshTree(true);
        return;
      }

      if (row) {
        const li = row.closest('li');
        const id = li?.dataset.uuid;
        if (!id) return;
        this.selectedId = id;
        this.refreshTree(true);
      }
    });
  }

  private refreshTree(force: boolean): void {
    const scene = getSceneRoot();
    if (!scene) {
      this.setStatus('未找到场景（cc.director.getScene 为空）');
      if (this.treeContainer) {
        this.treeContainer.innerHTML =
          '<div class="empty-scene">等待场景加载…</div>';
      }
      return;
    }

    const root = buildTreeInfo(scene);
    const nextHash = hashTree(root);

    if (!force && nextHash === this.treeHash) {
      return;
    }

    this.treeHash = nextHash;

    if (this.searchQuery) {
      this.expandMatchingNodes(root);
    }

    if (this.treeContainer) {
      this.treeContainer.innerHTML = `<ul class="node-tree">${this.renderTreeHtml(
        root,
        true
      )}</ul>`;
    }

    const total = this.countNodes(root);
    this.setStatus(`节点 ${total} · ${scene.name || 'Scene'}`);
  }

  private setStatus(text: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }

  private countNodes(node: TreeNodeInfo): number {
    return (
      1 + node.children.reduce((sum, child) => sum + this.countNodes(child), 0)
    );
  }

  private expandMatchingNodes(node: TreeNodeInfo): boolean {
    let matched = node.name.toLowerCase().includes(this.searchQuery);

    for (const child of node.children) {
      if (this.expandMatchingNodes(child)) {
        matched = true;
      }
    }

    if (matched && node.id) {
      this.expandedNodes.add(node.id);
    }

    return matched;
  }

  private renderTreeHtml(node: TreeNodeInfo, isRoot = false): string {
    if (this.searchQuery && !this.nodeMatchesSearch(node)) {
      return '';
    }

    const hasChildren = node.children.length > 0;
    const isExpanded = isRoot || this.expandedNodes.has(node.id);
    const isSelected = this.selectedId === node.id;
    const toggle = hasChildren ? (isExpanded ? '▼' : '▶') : '';
    const toggleClass = hasChildren ? 'node-toggle' : 'node-toggle-empty';
    const activeClass = node.active ? '' : ' node-inactive';

    let html = `<li data-uuid="${node.id}" class="${activeClass}${
      isSelected ? ' selected' : ''
    }">
      <div class="node-tree-item">
        <span class="${toggleClass}">${toggle}</span>
        <span class="node-name${node.active ? '' : ' inactive-node'}">${this.escapeHtml(
          node.name
        )}</span>
      </div>`;

    if (hasChildren) {
      const style = isExpanded ? '' : ' style="display:none"';
      html += `<ul class="node-children"${style}>`;
      for (const child of node.children) {
        html += this.renderTreeHtml(child);
      }
      html += '</ul>';
    }

    html += '</li>';
    return html;
  }

  private nodeMatchesSearch(node: TreeNodeInfo): boolean {
    if (node.name.toLowerCase().includes(this.searchQuery)) {
      return true;
    }
    return node.children.some((child) => this.nodeMatchesSearch(child));
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

new CocosInspector3();
