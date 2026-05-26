import {
  exportPageResourcesOnly,
  exportReplacementPack,
} from './replacementExport';
import {
  clearReplacementPairsForPage,
  deleteReplacementPair,
  discardLegacyReplacementDatabase,
  listReplacementPairs,
  type StoredReplacementPair,
} from './replacementStore';

discardLegacyReplacementDatabase();

export function createReplacementPanelElement(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'replacement-pack-panel';
  panel.dataset.tabPanel = 'replacements';
  panel.innerHTML = `
    <div class="replacement-pack-toolbar">
      <button type="button" class="replacement-export-btn">导出 zip</button>
      <button type="button" class="replacement-copy-repack-btn" title="复制 Node 重打包命令" disabled>复制重打包命令</button>
      <button type="button" class="replacement-resources-btn">资源 URL</button>
      <button type="button" class="replacement-clear-btn">清空</button>
    </div>
    <p class="replacement-export-status" hidden></p>
    <pre class="replacement-repack-cmd" hidden spellcheck="false"></pre>
    <p class="replacement-pack-hint">
      <strong>仅本次会话有效</strong>。点<strong>导出 zip</strong> 后，打开
      <a href="http://127.0.0.1:8787" target="_blank" rel="noopener">换皮打包站</a>
      （<code>npm run repack-web</code>）上传 zip + 试玩 html/URL → 下载试玩 HTML。
    </p>
    <div class="replacement-list"></div>
  `;

  const exportBtn = panel.querySelector('.replacement-export-btn') as HTMLButtonElement;
  const copyRepackBtn = panel.querySelector(
    '.replacement-copy-repack-btn'
  ) as HTMLButtonElement;
  const resourcesBtn = panel.querySelector('.replacement-resources-btn') as HTMLButtonElement;
  const clearBtn = panel.querySelector('.replacement-clear-btn') as HTMLButtonElement;
  const statusEl = panel.querySelector('.replacement-export-status') as HTMLElement;
  const repackCmdEl = panel.querySelector('.replacement-repack-cmd') as HTMLElement;
  const listEl = panel.querySelector('.replacement-list') as HTMLElement;

  let lastRepackCommand = '';

  const setStatus = (text: string, show = true) => {
    statusEl.hidden = !show;
    statusEl.textContent = text;
  };

  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    exportBtn.textContent = '导出中…';
    setStatus('正在生成 zip…');
    const result = await exportReplacementPack();
    exportBtn.disabled = false;
    exportBtn.textContent = '导出 zip';
    if (result.ok) {
      lastRepackCommand = result.repackCommand;
      copyRepackBtn.disabled = false;
      repackCmdEl.hidden = false;
      repackCmdEl.textContent = result.repackCommand;
      setStatus(
        `已下载 ${result.zipName}（${result.count} 条）→ 上传到换皮打包站`,
        true
      );
      exportBtn.title = result.zipName;
    } else {
      setStatus(result.error, true);
      exportBtn.title = result.error;
      alert(result.error);
    }
    await refreshReplacementList(listEl);
  });

  copyRepackBtn.addEventListener('click', async () => {
    if (!lastRepackCommand) {
      alert('请先导出替换包');
      return;
    }
    try {
      await navigator.clipboard.writeText(lastRepackCommand);
      setStatus('已复制重打包命令到剪贴板', true);
    } catch {
      prompt('复制以下命令到终端执行：', lastRepackCommand);
    }
  });

  resourcesBtn.addEventListener('click', () => {
    exportPageResourcesOnly();
    resourcesBtn.title = '已下载 page-resources.json';
  });

  clearBtn.addEventListener('click', async () => {
    if (!confirm('确定清空当前页面所有替换记录？')) return;
    await clearReplacementPairsForPage();
    await refreshReplacementList(listEl);
  });

  void refreshReplacementList(listEl);

  return panel;
}

export async function refreshReplacementList(container: HTMLElement): Promise<void> {
  const pairs = await listReplacementPairs();
  if (pairs.length === 0) {
    container.innerHTML =
      '<p class="replacement-empty">本次会话暂无替换。在 Sprite 检视器「上传替换」后会出现在这里；刷新页面后列表为空是正常现象。</p>';
    return;
  }

  container.innerHTML = pairs
    .map((p) => renderPairRow(p))
    .join('');

  container.querySelectorAll('[data-delete-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.deleteId;
      if (!id) return;
      await deleteReplacementPair(id);
      await refreshReplacementList(container);
    });
  });
}

function renderPairRow(p: StoredReplacementPair): string {
  const time = new Date(p.recordedAt).toLocaleString();
  const urls = p.original.assetUrls.slice(0, 2).join(', ') || '—';
  return `
    <div class="replacement-item" data-id="${escapeAttr(p.id)}">
      <div class="replacement-item-head">
        <strong>${escapeHtml(p.nodePath)}</strong>
        <button type="button" class="replacement-delete-btn" data-delete-id="${escapeAttr(p.id)}" title="删除此条">×</button>
      </div>
      <div class="replacement-item-meta">
        <span>原帧: ${escapeHtml(p.original.frameName)}</span>
        <span>新图: ${escapeHtml(p.replacement.fileName)} (${p.replacement.width}×${p.replacement.height})</span>
      </div>
      <div class="replacement-item-meta subtle">
        <span>匹配键: ${escapeHtml(p.matchKeys.slice(0, 4).join(' · '))}${p.matchKeys.length > 4 ? ' …' : ''}</span>
      </div>
      <div class="replacement-item-meta subtle">
        <span>资源: ${escapeHtml(urls)}</span>
        <span>${escapeHtml(time)}</span>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}
