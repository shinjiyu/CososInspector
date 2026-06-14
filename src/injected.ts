/// <reference path="./types/cocos.d.ts" />

import { isCocos3, log, waitForCocos3 } from './cocos3/detect';
import { installMcpBridge } from './cocos3/mcpBridge';
import {
  expandSuspectPaths,
  type PerfScanMode,
  type PerfScanReport,
  runPerfScan,
} from './cocos3/perfScan';
import {
  buildTreeInfo,
  findNodeById,
  getNodeId,
  getSceneRoot,
  hashTree,
  setNodeActive,
} from './cocos3/sceneTree';
import {
  countNodes,
  expandMatchingNodes,
  maxPerfGain,
  renderTreeHtml,
} from './cocos3/treeRender';

const REFRESH_MS = 500;

class CocosInspector3 {
  private root: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private edgeTab: HTMLButtonElement | null = null;
  private sceneTreeContainer: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private statusEl: HTMLElement | null = null;
  private mainBody: HTMLElement | null = null;
  private mcpStatusEl: HTMLElement | null = null;
  private scanBtn: HTMLButtonElement | null = null;
  private scanModeSelect: HTMLSelectElement | null = null;
  private clearScanBtn: HTMLButtonElement | null = null;

  private expandedScene = new Set<string>();
  private selectedId: string | null = null;
  private searchQuery = '';
  private isCollapsed = false;
  private sceneTreeHash = '';
  private updateTimer: number | null = null;

  private scanRunning = false;
  private scanCancel = false;
  private perfReport: PerfScanReport | null = null;

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
    installMcpBridge();
    window.postMessage({ type: 'cocos-inspector-ready' }, '*');
    log('已启动（全量场景树 + Active 编辑 + 性能扫描）');
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

    this.scanModeSelect = document.createElement('select');
    this.scanModeSelect.className = 'perf-scan-mode';
    this.scanModeSelect.title = '性能扫描粒度';
    [
      ['quick', '快速'],
      ['standard', '标准'],
      ['fine', '精细'],
    ].forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      if (value === 'standard') opt.selected = true;
      this.scanModeSelect!.appendChild(opt);
    });
    controls.appendChild(this.scanModeSelect);

    this.scanBtn = document.createElement('button');
    this.scanBtn.type = 'button';
    this.scanBtn.className = 'perf-scan-btn';
    this.scanBtn.textContent = '扫描性能';
    this.scanBtn.title = '逐个关闭子树测量 FPS 增益，定位掉帧热点';
    this.scanBtn.addEventListener('click', () => void this.startPerfScan());
    controls.appendChild(this.scanBtn);

    this.clearScanBtn = document.createElement('button');
    this.clearScanBtn.type = 'button';
    this.clearScanBtn.className = 'perf-clear-btn';
    this.clearScanBtn.textContent = '清除';
    this.clearScanBtn.title = '清除性能扫描结果';
    this.clearScanBtn.addEventListener('click', () => this.clearPerfScan());
    controls.appendChild(this.clearScanBtn);

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'search';
    this.searchInput.className = 'search-input';
    this.searchInput.placeholder = '搜索节点名称…';
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

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'inspector-status';
    this.panel.appendChild(this.statusEl);

    this.mainBody = document.createElement('div');
    this.mainBody.className = 'inspector-main';

    this.sceneTreeContainer = document.createElement('div');
    this.sceneTreeContainer.className = 'node-tree-panel active';
    this.sceneTreeContainer.dataset.tabPanel = 'scene';
    this.mainBody.appendChild(this.sceneTreeContainer);

    this.panel.appendChild(this.mainBody);
    this.root.appendChild(this.panel);
    document.body.appendChild(this.root);
  }

  private setScanUiRunning(running: boolean): void {
    if (this.scanBtn) {
      this.scanBtn.disabled = running;
      this.scanBtn.textContent = running ? '扫描中…' : '扫描性能';
    }
    if (this.scanModeSelect) this.scanModeSelect.disabled = running;
    if (this.clearScanBtn) this.clearScanBtn.disabled = running;
  }

  private clearPerfScan(): void {
    if (this.scanRunning) return;
    this.perfReport = null;
    this.refreshAll(true);
    this.setStatus('已清除性能扫描结果');
  }

  private async startPerfScan(): Promise<void> {
    if (this.scanRunning) {
      this.scanCancel = true;
      return;
    }

    const scene = getSceneRoot();
    if (!scene) {
      this.setStatus('无法扫描：场景未就绪');
      return;
    }

    const mode = (this.scanModeSelect?.value ?? 'standard') as PerfScanMode;
    this.scanRunning = true;
    this.scanCancel = false;
    this.setScanUiRunning(true);
    this.stopAutoRefresh();

    const report = await runPerfScan(
      mode,
      (p) => {
        if (p.phase === 'scanning' || p.phase === 'baseline') {
          this.setStatus(
            `${p.message} · ${p.testsDone}/${p.testsBudget}`
          );
        } else {
          this.setStatus(p.message);
        }
      },
      () => this.scanCancel
    );

    this.scanRunning = false;
    this.scanCancel = false;
    this.setScanUiRunning(false);
    this.startAutoRefresh();

    if (report) {
      this.perfReport = report;
      expandSuspectPaths(scene, report.gainByNodeId, this.expandedScene, 0.5);
      const top = report.suspects[0];
      if (top) {
        this.selectedId = top.nodeId;
        console.log(
          `[性能扫描] Top ${top.nodeName}(${top.nodeId}) +${top.fpsGain.toFixed(1)}fps · ${top.path}`
        );
      }
    }

    this.refreshAll(true);
  }

  private stopAutoRefresh(): void {
    if (this.updateTimer !== null) {
      window.clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  private updateMcpStatus(
    status: 'connecting' | 'connected' | 'disconnected',
    port: number
  ): void {
    if (this.isCollapsed || !this.mcpStatusEl) return;

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
      connected: `已连接 Cursor MCP 桥接（端口 ${port}）`,
      disconnected: `未连接 MCP。请在 Cursor 启用 cocos-inspector MCP，并确认端口 ${port} 可用。`,
    };
    this.mcpStatusEl.title = hints[status];
  }

  private toggleCollapse(): void {
    this.setCollapsed(!this.isCollapsed);
  }

  /** 收起：从 DOM 移除面板、清空树、停止定时刷新，仅保留边缘标签 */
  private detachPanel(): void {
    if (this.sceneTreeContainer) {
      this.sceneTreeContainer.innerHTML = '';
    }
    if (this.statusEl) {
      this.statusEl.textContent = '';
    }
    this.sceneTreeHash = '';
    this.panel?.remove();
  }

  private setCollapsed(collapsed: boolean): void {
    if (!this.root || this.isCollapsed === collapsed) return;

    this.isCollapsed = collapsed;
    this.root.classList.toggle('is-collapsed', collapsed);

    if (collapsed) {
      if (this.scanRunning) {
        this.scanCancel = true;
      }
      this.stopAutoRefresh();
      this.detachPanel();
      log('面板已收起，停止渲染');
      return;
    }

    if (this.panel && !this.root.contains(this.panel)) {
      this.root.appendChild(this.panel);
    }

    const headerBtn = this.panel?.querySelector(
      '.header-toggle-btn'
    ) as HTMLButtonElement | null;
    if (headerBtn) {
      headerBtn.textContent = '收起';
      headerBtn.title = '收起面板';
    }

    this.refreshAll(true);
    this.startAutoRefresh();
    log('面板已展开，恢复渲染');
  }

  private startAutoRefresh(): void {
    if (this.isCollapsed || this.scanRunning) return;
    this.stopAutoRefresh();
    this.updateTimer = window.setInterval(
      () => this.refreshAll(false),
      REFRESH_MS
    );
  }

  private bindTreeEvents(): void {
    this.sceneTreeContainer?.addEventListener('change', (event: Event) => {
      const target = event.target as HTMLElement;
      const toggle = target.closest('.node-active-toggle') as HTMLInputElement | null;
      if (!toggle || toggle.type !== 'checkbox') return;

      event.stopPropagation();
      const nodeId = toggle.dataset.uuid;
      if (!nodeId) return;

      const active = toggle.checked;
      const ok = setNodeActive(nodeId, active);
      if (!ok) {
        toggle.checked = !active;
        console.warn(`[Active编辑] 切换失败 nodeId=${nodeId}`);
        return;
      }

      const scene = getSceneRoot();
      const node = scene ? findNodeById(scene, nodeId) : null;
      const nodeName = node?.name ?? '(unknown)';
      console.log(`[Active编辑] ${nodeName}(${nodeId}) active=${active}`);
      this.refreshAll(true);
    });

    this.sceneTreeContainer?.addEventListener('click', (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.closest('.node-active-toggle')) return;

      const toggle = target.closest('.node-toggle');
      const row = target.closest('.node-tree-item');

      if (toggle) {
        const li = toggle.closest('li');
        const id = li?.dataset.uuid;
        if (!id) return;

        if (this.expandedScene.has(id)) {
          this.expandedScene.delete(id);
        } else {
          this.expandedScene.add(id);
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
    });
  }

  private refreshAll(force: boolean): void {
    if (this.isCollapsed) return;

    const scene = getSceneRoot();
    if (!scene) {
      this.setStatus('未找到场景（cc.director.getScene 为空）');
      if (this.sceneTreeContainer) {
        this.sceneTreeContainer.innerHTML =
          '<div class="empty-scene">等待场景加载…</div>';
      }
      return;
    }

    const treeInfo = buildTreeInfo(scene);
    const perfGain = this.perfReport?.gainByNodeId;
    const perfHash = perfGain
      ? [...perfGain.entries()].map(([k, v]) => `${k}:${v.toFixed(1)}`).join(',')
      : '';
    const nextSceneHash = `${hashTree(treeInfo)}|perf:${perfHash}`;

    if (!force && nextSceneHash === this.sceneTreeHash) {
      return;
    }

    this.sceneTreeHash = nextSceneHash;

    if (this.searchQuery) {
      expandMatchingNodes(treeInfo, this.searchQuery, this.expandedScene);
    }

    const sceneRootId = getNodeId(scene);
    const perfGainMax = maxPerfGain(perfGain);

    if (this.sceneTreeContainer) {
      this.sceneTreeContainer.innerHTML = `<ul class="node-tree">${renderTreeHtml(
        treeInfo,
        {
          expanded: this.expandedScene,
          selectedId: this.selectedId,
          searchQuery: this.searchQuery,
          isRoot: true,
          sceneRootId,
          perfGainByNodeId: perfGain,
          perfGainMax,
        }
      )}</ul>`;
    }

    const nodeCount = countNodes(treeInfo);
    if (this.scanRunning) return;

    if (this.perfReport) {
      const top = this.perfReport.suspects[0];
      const topText = top
        ? ` · Top ${top.nodeName} +${top.fpsGain.toFixed(1)}fps`
        : '';
      this.setStatus(
        `场景树 · ${nodeCount} 节点 · 基准 ${this.perfReport.baselineFps.toFixed(0)}fps${topText}`
      );
      return;
    }

    this.setStatus(`场景树 · ${nodeCount} 个节点 · ${scene.name || 'Scene'}`);
  }

  private setStatus(text: string): void {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }
}

new CocosInspector3();
