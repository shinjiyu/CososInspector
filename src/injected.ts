/// <reference path="./types/cocos.d.ts" />

import { isCocos3, log, waitForCocos3 } from './cocos3/detect';
import { getSceneRoot, hashTree, type TreeNodeInfo } from './cocos3/sceneTree';
import { buildCompressedTreeInfo } from './cocos3/sprite';
import {
  collectSpriteList,
  filterSpriteList,
  hashSpriteList,
  renderSpriteListHtml,
} from './cocos3/spriteList';
import {
  applySpriteListThumbnails,
  startSpriteThumbnailPoller,
} from './cocos3/spriteListThumb';
import {
  countNodes,
  expandMatchingNodes,
  renderTreeHtml,
} from './cocos3/treeRender';
import {
  collectSpriteInspectData,
  createSpriteInspectorElement,
  enrichSpriteInspectData,
  renderSpriteInspectorPanel,
} from './cocos3/spriteInspector';
import {
  createReplacementPanelElement,
  refreshReplacementList,
} from './cocos3/replacementPanel';
import { installMcpBridge } from './cocos3/mcpBridge';

const REFRESH_MS = 500;
type InspectorTab = 'scene' | 'sprite' | 'replacements';

class CocosInspector3 {
  private root: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private edgeTab: HTMLButtonElement | null = null;
  private sceneTreeContainer: HTMLElement | null = null;
  private spriteTreeContainer: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private statusEl: HTMLElement | null = null;
  private mainBody: HTMLElement | null = null;
  private spriteInspectorEl: HTMLElement | null = null;
  private replacementPanelEl: HTMLElement | null = null;
  private replacementListEl: HTMLElement | null = null;
  private spriteInspectSeq = 0;

  private currentTab: InspectorTab = 'scene';
  private expandedScene = new Set<string>();
  private selectedId: string | null = null;
  private searchQuery = '';
  private isCollapsed = false;
  private sceneTreeHash = '';
  private spriteListHash = '';
  private updateTimer: number | null = null;
  private stopThumbPoller: (() => void) | null = null;
  private mcpStatusEl: HTMLElement | null = null;

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
    this.refreshAll(true);
    this.startAutoRefresh();

    const win = window as Window & {
      CocosInspector3?: CocosInspector3;
      __cocosInspectorTexTest?: (nodeId?: string) => Promise<unknown>;
    };
    win.CocosInspector3 = this;
    win.__cocosInspectorTexTest = async (nodeId?: string) => {
      const id = nodeId ?? this.selectedId;
      const base = collectSpriteInspectData(id);
      if (!base) return { ok: false, reason: 'no sprite data' };
      return enrichSpriteInspectData(base, id);
    };
    installMcpBridge();
    window.postMessage({ type: 'cocos-inspector-ready' }, '*');
    this.stopThumbPoller = startSpriteThumbnailPoller(
      () => this.spriteTreeContainer
    );
    log('已启动（场景压缩树 + Sprite 列表）');
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

    const headerTop = document.createElement('div');
    headerTop.className = 'inspector-header-top';

    const titleBlock = document.createElement('div');
    titleBlock.className = 'inspector-header-title-block';

    const title = document.createElement('h3');
    title.textContent = 'Cocos Inspector 3';
    titleBlock.appendChild(title);

    const version = document.createElement('span');
    version.className = 'engine-version';
    version.textContent = `引擎 ${window.cc.ENGINE_VERSION ?? '3.x'}`;
    titleBlock.appendChild(version);

    headerTop.appendChild(titleBlock);

    this.mcpStatusEl = document.createElement('div');
    this.mcpStatusEl.className = 'mcp-status mcp-status--disconnected';
    this.mcpStatusEl.innerHTML =
      '<span class="mcp-status-dot" aria-hidden="true"></span><span class="mcp-status-label">MCP</span>';
    this.updateMcpStatus('disconnected', 17373);
    headerTop.appendChild(this.mcpStatusEl);

    header.appendChild(headerTop);

    window.addEventListener('message', (ev) => {
      if (ev.source !== window || ev.data?.type !== 'cocos-mcp-status') return;
      this.updateMcpStatus(ev.data.status ?? 'disconnected', ev.data.port ?? 17373);
    });

    const controls = document.createElement('div');
    controls.className = 'inspector-controls';

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'refresh-btn';
    refreshBtn.textContent = '刷新';
    refreshBtn.addEventListener('click', () => this.refreshAll(true));
    controls.appendChild(refreshBtn);

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'search';
    this.searchInput.className = 'search-input';
    this.searchInput.placeholder = '搜索节点 / 贴图…';
    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput?.value.trim().toLowerCase() ?? '';
      this.refreshAll(true);
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

    const tabs = document.createElement('div');
    tabs.className = 'inspector-tabs';

    const sceneTabBtn = document.createElement('button');
    sceneTabBtn.type = 'button';
    sceneTabBtn.className = 'inspector-tab active';
    sceneTabBtn.dataset.tab = 'scene';
    sceneTabBtn.textContent = '场景（压缩）';
    sceneTabBtn.addEventListener('click', () => this.switchTab('scene'));

    const spriteTabBtn = document.createElement('button');
    spriteTabBtn.type = 'button';
    spriteTabBtn.className = 'inspector-tab';
    spriteTabBtn.dataset.tab = 'sprite';
    spriteTabBtn.textContent = 'Sprite';
    spriteTabBtn.addEventListener('click', () => this.switchTab('sprite'));

    const replaceTabBtn = document.createElement('button');
    replaceTabBtn.type = 'button';
    replaceTabBtn.className = 'inspector-tab';
    replaceTabBtn.dataset.tab = 'replacements';
    replaceTabBtn.textContent = '替换包';
    replaceTabBtn.addEventListener('click', () => this.switchTab('replacements'));

    tabs.appendChild(sceneTabBtn);
    tabs.appendChild(spriteTabBtn);
    tabs.appendChild(replaceTabBtn);
    this.panel.appendChild(tabs);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'inspector-status';
    this.panel.appendChild(this.statusEl);

    this.mainBody = document.createElement('div');
    this.mainBody.className = 'inspector-main';

    this.sceneTreeContainer = document.createElement('div');
    this.sceneTreeContainer.className = 'node-tree-panel active';
    this.sceneTreeContainer.dataset.tabPanel = 'scene';
    this.mainBody.appendChild(this.sceneTreeContainer);

    this.spriteTreeContainer = document.createElement('div');
    this.spriteTreeContainer.className = 'node-tree-panel';
    this.spriteTreeContainer.dataset.tabPanel = 'sprite';
    this.mainBody.appendChild(this.spriteTreeContainer);

    this.replacementPanelEl = createReplacementPanelElement();
    this.replacementListEl = this.replacementPanelEl.querySelector(
      '.replacement-list'
    );
    this.mainBody.appendChild(this.replacementPanelEl);

    this.panel.appendChild(this.mainBody);

    this.spriteInspectorEl = createSpriteInspectorElement({
      getNodeId: () => this.selectedId,
      onReplaced: () => this.refreshAll(true),
      onPairSaved: () => void this.refreshReplacementPanel(),
    });
    this.panel.appendChild(this.spriteInspectorEl);
    this.root.appendChild(this.panel);
    document.body.appendChild(this.root);
  }

  private switchTab(tab: InspectorTab): void {
    this.currentTab = tab;
    this.panel
      ?.querySelectorAll('.inspector-tab')
      .forEach((el) => {
        el.classList.toggle(
          'active',
          (el as HTMLElement).dataset.tab === tab
        );
      });
    this.sceneTreeContainer?.classList.toggle('active', tab === 'scene');
    this.spriteTreeContainer?.classList.toggle('active', tab === 'sprite');
    this.replacementPanelEl?.classList.toggle('active', tab === 'replacements');
    this.updateSearchPlaceholder();
    if (tab === 'replacements') {
      void this.refreshReplacementPanel();
    } else {
      this.refreshAll(true);
    }
  }

  private async refreshReplacementPanel(): Promise<void> {
    if (this.replacementListEl) {
      await refreshReplacementList(this.replacementListEl);
    }
  }

  private updateSearchPlaceholder(): void {
    if (!this.searchInput) return;
    if (this.currentTab === 'replacements') {
      this.searchInput.placeholder = '替换包页无需搜索';
      return;
    }
    this.searchInput.placeholder =
      this.currentTab === 'sprite'
        ? '搜索 Sprite 节点 / 贴图名…'
        : '搜索节点名称…';
  }

  private updateMcpStatus(
    status: 'connecting' | 'connected' | 'disconnected',
    port: number
  ): void {
    if (!this.mcpStatusEl) return;

    const labels: Record<typeof status, string> = {
      connecting: '连接中',
      connected: '已连接',
      disconnected: '未连接',
    };

    this.mcpStatusEl.className = `mcp-status mcp-status--${status}`;
    const label = this.mcpStatusEl.querySelector('.mcp-status-label');
    if (label) label.textContent = `MCP · ${labels[status]}`;

    const hints: Record<typeof status, string> = {
      connecting: `正在连接本机桥接 ws://127.0.0.1:${port} …`,
      connected: `已连接 Cursor MCP 桥接（端口 ${port}）。Agent 可调用纹理/替换/导出工具。`,
      disconnected: `未连接 MCP。请在 Cursor 启用 cocos-inspector MCP，并确认端口 ${port} 可用。`,
    };
    this.mcpStatusEl.title = hints[status];
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
    this.updateTimer = window.setInterval(
      () => this.refreshAll(false),
      REFRESH_MS
    );
  }

  private bindTreeEvents(): void {
    const onClick = (container: HTMLElement) => (event: Event) => {
      const target = event.target as HTMLElement;
      const toggle = target.closest('.node-toggle');
      const row = target.closest('.node-tree-item');
      if (toggle) {
        const expanded = this.expandedScene;
        const li = toggle.closest('li');
        const id = li?.dataset.uuid;
        if (!id) return;

        if (expanded.has(id)) {
          expanded.delete(id);
        } else {
          expanded.add(id);
        }
        this.refreshAll(true);
        return;
      }

      if (row) {
        const li = row.closest('li');
        const id = li?.dataset.uuid;
        if (!id) return;
        this.selectedId = id;
        this.refreshAll(true);
      }
    };

    this.sceneTreeContainer?.addEventListener(
      'click',
      onClick(this.sceneTreeContainer)
    );
    this.spriteTreeContainer?.addEventListener('click', (event: Event) => {
      const row = (event.target as HTMLElement).closest('.sprite-list-item');
      if (!row) return;
      const id = (row as HTMLElement).dataset.uuid;
      if (!id) return;
      this.selectedId = id;
      this.refreshAll(true);
    });
  }

  private refreshAll(force: boolean): void {
    const scene = getSceneRoot();
    if (!scene) {
      this.setStatus('未找到场景（cc.director.getScene 为空）');
      const empty = '<div class="empty-scene">等待场景加载…</div>';
      if (this.sceneTreeContainer) this.sceneTreeContainer.innerHTML = empty;
      if (this.spriteTreeContainer) this.spriteTreeContainer.innerHTML = empty;
      this.updateSpriteInspector();
      return;
    }

    const compressed = buildCompressedTreeInfo(scene);
    const allSprites = collectSpriteList(scene);
    const filteredSprites = filterSpriteList(allSprites, this.searchQuery);

    const nextSceneHash = hashTree(compressed);
    const nextSpriteHash = hashSpriteList(allSprites);

    if (
      !force &&
      nextSceneHash === this.sceneTreeHash &&
      nextSpriteHash === this.spriteListHash
    ) {
      this.updateSpriteInspector();
      return;
    }

    this.sceneTreeHash = nextSceneHash;
    this.spriteListHash = nextSpriteHash;

    if (this.searchQuery && this.currentTab === 'scene') {
      expandMatchingNodes(compressed, this.searchQuery, this.expandedScene);
    }

    const baseRenderOpts = {
      selectedId: this.selectedId,
      searchQuery: this.searchQuery,
      isRoot: true,
      showSpriteBadge: true,
    };

    if (this.sceneTreeContainer) {
      this.sceneTreeContainer.innerHTML = `<ul class="node-tree">${renderTreeHtml(
        compressed,
        { ...baseRenderOpts, expanded: this.expandedScene }
      )}</ul>`;
    }

    if (this.spriteTreeContainer) {
      this.spriteTreeContainer.innerHTML = renderSpriteListHtml(
        filteredSprites,
        this.selectedId
      );
      applySpriteListThumbnails(this.spriteTreeContainer);
    }

    const sceneCount = countNodes(compressed);
    const spriteCount = allSprites.length;
    const spriteVisible = filteredSprites.length;
    if (this.currentTab === 'replacements') {
      void this.refreshReplacementPanel();
      this.setStatus(`替换包 · Sprite ${spriteCount} 个 · ${scene.name || 'Scene'}`);
      this.updateSpriteInspector();
      return;
    }

    const tabLabel = this.currentTab === 'scene' ? '场景（压缩）' : 'Sprite';
    const visible =
      this.currentTab === 'scene' ? sceneCount : spriteVisible;
    const spriteStatus =
      this.currentTab === 'sprite' && this.searchQuery && spriteVisible !== spriteCount
        ? ` · 共 ${spriteCount} 个`
        : '';
    this.setStatus(
      `${tabLabel} · 列表 ${visible} 项${spriteStatus} · Sprite ${spriteCount} 个 · ${scene.name || 'Scene'}`
    );
    this.updateSpriteInspector();
  }

  private updateSpriteInspector(): void {
    if (!this.spriteInspectorEl) return;

    const seq = ++this.spriteInspectSeq;
    const base = collectSpriteInspectData(this.selectedId);

    renderSpriteInspectorPanel(
      this.spriteInspectorEl,
      base,
      this.selectedId,
      !!base
    );

    if (!base) return;

    enrichSpriteInspectData(base, this.selectedId).then((enriched) => {
      if (seq !== this.spriteInspectSeq) return;
      renderSpriteInspectorPanel(
        this.spriteInspectorEl!,
        enriched,
        this.selectedId,
        false
      );
    });
  }

  private setStatus(text: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }
}

new CocosInspector3();
