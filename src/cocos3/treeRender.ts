export interface TreeRenderOptions {
  expanded: Set<string>;
  selectedId: string | null;
  searchQuery: string;
  isRoot?: boolean;
  /** 场景根节点 id，不显示 active 勾选框 */
  sceneRootId?: string;
  /** 性能扫描：nodeId → 关子树 FPS 增益 */
  perfGainByNodeId?: Map<string, number>;
  perfGainMax?: number;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderTreeHtml(
  node: import('./sceneTree').TreeNodeInfo,
  opts: TreeRenderOptions
): string {
  if (opts.searchQuery && !nodeMatchesSearch(node, opts.searchQuery)) {
    return '';
  }

  const hasChildren = node.children.length > 0;
  const isExpanded = opts.isRoot || opts.expanded.has(node.id);
  const isSelected = opts.selectedId === node.id;
  const toggle = hasChildren ? (isExpanded ? '▼' : '▶') : '';
  const toggleClass = hasChildren ? 'node-toggle' : 'node-toggle-empty';
  const activeClass = node.active ? '' : ' node-inactive';
  const isSceneRoot = !!opts.sceneRootId && node.id === opts.sceneRootId;
  const activeToggle = isSceneRoot
    ? ''
    : `<input type="checkbox" class="node-active-toggle" data-uuid="${node.id}"${
        node.active ? ' checked' : ''
      } title="Active" aria-label="切换节点激活状态">`;

  const gain = opts.perfGainByNodeId?.get(node.id);
  const perfBadge =
    gain !== undefined && gain > 0
      ? renderPerfBadge(gain, opts.perfGainMax ?? gain)
      : '';

  let html = `<li data-uuid="${node.id}" class="${activeClass.trim()}${
    isSelected ? ' selected' : ''
  }${gain !== undefined && gain > 0 ? ' node-perf-hot' : ''}">
      <div class="node-tree-item">
        <span class="${toggleClass}">${toggle}</span>
        ${activeToggle}
        <span class="node-name${node.active ? '' : ' inactive-node'}">${escapeHtml(
          node.name
        )}</span>
        ${perfBadge}
      </div>`;

  if (hasChildren) {
    const style = isExpanded ? '' : ' style="display:none"';
    html += `<ul class="node-children"${style}>`;
    for (const child of node.children) {
      html += renderTreeHtml(child, { ...opts, isRoot: false });
    }
    html += '</ul>';
  }

  html += '</li>';
  return html;
}

function nodeMatchesSearch(
  node: import('./sceneTree').TreeNodeInfo,
  q: string
): boolean {
  if (node.name.toLowerCase().includes(q)) return true;
  return node.children.some((c) => nodeMatchesSearch(c, q));
}

export function expandMatchingNodes(
  node: import('./sceneTree').TreeNodeInfo,
  q: string,
  expanded: Set<string>
): boolean {
  let matched = node.name.toLowerCase().includes(q);

  for (const child of node.children) {
    if (expandMatchingNodes(child, q, expanded)) {
      matched = true;
    }
  }

  if (matched && node.id) {
    expanded.add(node.id);
  }

  return matched;
}

export function countNodes(node: import('./sceneTree').TreeNodeInfo): number {
  return (
    1 + node.children.reduce((sum, child) => sum + countNodes(child), 0)
  );
}

function renderPerfBadge(gain: number, maxGain: number): string {
  const ratio = maxGain > 0 ? gain / maxGain : 1;
  const level =
    ratio >= 0.66 ? 'high' : ratio >= 0.33 ? 'medium' : 'low';
  const label = `+${gain.toFixed(1)}fps`;
  return `<span class="perf-gain-badge perf-gain-${level}" title="关闭此子树 FPS 提升约 ${label}">${label}</span>`;
}

export function maxPerfGain(gainMap?: Map<string, number>): number {
  if (!gainMap || gainMap.size === 0) return 0;
  let max = 0;
  for (const g of gainMap.values()) {
    if (g > max) max = g;
  }
  return max;
}
