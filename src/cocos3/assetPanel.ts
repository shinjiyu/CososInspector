import {
  collectAssetInventory,
  type AssetInventory,
  type AssetLoadState,
  type AssetRecord,
} from './assetInventory';

const STATE_LABEL: Record<AssetLoadState, string> = {
  loaded: '已加载',
  loading: '加载中',
  failed: '失败',
  unknown: '未知',
};

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export class AssetFloatingPanel {
  private root: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private summaryEl: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private tab: 'assets' | 'bundles' = 'assets';
  private searchQuery = '';
  private visible = false;
  private refreshTimer: number | null = null;
  private dragState: { x: number; y: number; left: number; top: number } | null =
    null;

  toggle(): void {
    if (this.visible) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (!this.root) this.create();
    if (!this.root) return;
    this.visible = true;
    this.root.style.display = 'flex';
    this.refresh();
    this.startAutoRefresh();
  }

  close(): void {
    this.visible = false;
    this.stopAutoRefresh();
    if (this.root) this.root.style.display = 'none';
  }

  destroy(): void {
    this.stopAutoRefresh();
    this.root?.remove();
    this.root = null;
    this.bodyEl = null;
    this.summaryEl = null;
    this.searchInput = null;
    this.visible = false;
  }

  private create(): void {
    const panel = document.createElement('div');
    panel.className = 'asset-float-panel';
    panel.style.display = 'none';

    const header = document.createElement('div');
    header.className = 'asset-float-header';

    const title = document.createElement('span');
    title.className = 'asset-float-title';
    title.textContent = '资源加载状态';
    header.appendChild(title);

    const headerActions = document.createElement('div');
    headerActions.className = 'asset-float-header-actions';

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'asset-float-icon-btn';
    refreshBtn.textContent = '↻';
    refreshBtn.title = '刷新';
    refreshBtn.addEventListener('click', () => this.refresh());
    headerActions.appendChild(refreshBtn);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'asset-float-icon-btn';
    closeBtn.textContent = '×';
    closeBtn.title = '关闭';
    closeBtn.addEventListener('click', () => this.close());
    headerActions.appendChild(closeBtn);

    header.appendChild(headerActions);
    panel.appendChild(header);

    this.bindDrag(header, panel);

    this.summaryEl = document.createElement('div');
    this.summaryEl.className = 'asset-float-summary';
    panel.appendChild(this.summaryEl);

    const toolbar = document.createElement('div');
    toolbar.className = 'asset-float-toolbar';

    const tabAssets = document.createElement('button');
    tabAssets.type = 'button';
    tabAssets.className = 'asset-float-tab active';
    tabAssets.dataset.tab = 'assets';
    tabAssets.textContent = '资源';
    tabAssets.addEventListener('click', () => this.setTab('assets'));
    toolbar.appendChild(tabAssets);

    const tabBundles = document.createElement('button');
    tabBundles.type = 'button';
    tabBundles.className = 'asset-float-tab';
    tabBundles.dataset.tab = 'bundles';
    tabBundles.textContent = 'Bundle';
    tabBundles.addEventListener('click', () => this.setTab('bundles'));
    toolbar.appendChild(tabBundles);

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'search';
    this.searchInput.className = 'asset-float-search';
    this.searchInput.placeholder = '搜索名称 / UUID / Bundle…';
    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput?.value.trim().toLowerCase() ?? '';
      this.renderLastInventory();
    });
    toolbar.appendChild(this.searchInput);

    panel.appendChild(toolbar);

    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'asset-float-body';
    panel.appendChild(this.bodyEl);

    document.body.appendChild(panel);
    this.root = panel;
    this.lastInventory = null;
  }

  private lastInventory: AssetInventory | null = null;

  private setTab(tab: 'assets' | 'bundles'): void {
    this.tab = tab;
    this.root?.querySelectorAll('.asset-float-tab').forEach((el) => {
      el.classList.toggle(
        'active',
        (el as HTMLElement).dataset.tab === tab
      );
    });
    this.renderLastInventory();
  }

  private bindDrag(header: HTMLElement, panel: HTMLElement): void {
    header.addEventListener('mousedown', (ev) => {
      if ((ev.target as HTMLElement).closest('button')) return;
      ev.preventDefault();
      const rect = panel.getBoundingClientRect();
      this.dragState = {
        x: ev.clientX,
        y: ev.clientY,
        left: rect.left,
        top: rect.top,
      };
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.left = `${rect.left}px`;
      panel.style.top = `${rect.top}px`;

      const onMove = (e: MouseEvent) => {
        if (!this.dragState) return;
        const dx = e.clientX - this.dragState.x;
        const dy = e.clientY - this.dragState.y;
        panel.style.left = `${this.dragState.left + dx}px`;
        panel.style.top = `${this.dragState.top + dy}px`;
      };

      const onUp = () => {
        this.dragState = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = window.setInterval(() => {
      if (this.visible) this.refresh();
    }, 1500);
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  refresh(): void {
    const inv = collectAssetInventory();
    this.lastInventory = inv;
    if (!inv) {
      if (this.summaryEl) {
        this.summaryEl.textContent = '未找到 cc.assetManager（非 Cocos 3 或尚未初始化）';
      }
      if (this.bodyEl) {
        this.bodyEl.innerHTML =
          '<div class="asset-float-empty">资源系统不可用</div>';
      }
      return;
    }

    const s = inv.summary;
    if (this.summaryEl) {
      this.summaryEl.textContent =
        `资源 ${s.assetCount} · Bundle ${s.bundleCount} · 已加载 ${s.loadedCount}` +
        (s.loadingCount > 0 ? ` · 加载中 ${s.loadingCount}` : '') +
        (s.pipelineTasks > 0 ? ` · 管线 ${s.pipelineTasks}` : '');
    }

    this.renderInventory(inv);
  }

  private renderLastInventory(): void {
    if (this.lastInventory) this.renderInventory(this.lastInventory);
  }

  private renderInventory(inv: AssetInventory): void {
    if (!this.bodyEl) return;

    if (this.tab === 'bundles') {
      this.bodyEl.innerHTML = this.renderBundlesHtml(inv);
      return;
    }

    const filtered = this.filterAssets(inv.assets);
    if (filtered.length === 0) {
      this.bodyEl.innerHTML = '<div class="asset-float-empty">无匹配资源</div>';
      return;
    }

    const rows = filtered
      .slice(0, 500)
      .map((a) => this.renderAssetRow(a))
      .join('');
    const more =
      filtered.length > 500
        ? `<div class="asset-float-more">仅显示前 500 条，共 ${filtered.length} 条</div>`
        : '';
    this.bodyEl.innerHTML = `<table class="asset-float-table"><thead><tr>
      <th>名称</th><th>类型</th><th>状态</th><th>引用</th><th>Bundle</th>
    </tr></thead><tbody>${rows}</tbody></table>${more}`;
  }

  private filterAssets(assets: AssetRecord[]): AssetRecord[] {
    if (!this.searchQuery) return assets;
    const q = this.searchQuery;
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.uuid.toLowerCase().includes(q) ||
        a.bundle.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q)
    );
  }

  private renderAssetRow(a: AssetRecord): string {
    const stateClass = `asset-state-${a.state}`;
    return `<tr class="${stateClass}" title="${escapeHtml(a.uuid)}">
      <td class="asset-col-name">${escapeHtml(a.name)}</td>
      <td>${escapeHtml(a.type)}</td>
      <td><span class="asset-state-badge ${stateClass}">${STATE_LABEL[a.state]}</span></td>
      <td class="asset-col-num">${a.refCount}</td>
      <td>${escapeHtml(a.bundle || '-')}</td>
    </tr>`;
  }

  private renderBundlesHtml(inv: AssetInventory): string {
    const q = this.searchQuery;
    const bundles = q
      ? inv.bundles.filter(
          (b) =>
            b.name.toLowerCase().includes(q) ||
            b.base.toLowerCase().includes(q)
        )
      : inv.bundles;

    if (bundles.length === 0) {
      return '<div class="asset-float-empty">无匹配 Bundle</div>';
    }

    const rows = bundles
      .map(
        (b) => `<tr>
        <td>${escapeHtml(b.name)}</td>
        <td class="asset-col-path">${escapeHtml(b.base || '-')}</td>
        <td class="asset-col-num">${b.assetCount}</td>
        <td>${escapeHtml(b.deps.join(', ') || '-')}</td>
      </tr>`
      )
      .join('');

    return `<table class="asset-float-table"><thead><tr>
      <th>名称</th><th>Base</th><th>资源数</th><th>依赖</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
  }
}
