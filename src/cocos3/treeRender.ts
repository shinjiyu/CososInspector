export interface TreeRenderOptions {
  expanded: Set<string>;
  selectedId: string | null;
  searchQuery: string;
  isRoot?: boolean;
  showSpriteBadge?: boolean;
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
  const spriteClass = node.hasSprite ? ' node-has-sprite' : '';

  const badge =
    opts.showSpriteBadge && node.hasSprite && node.spriteHint
      ? `<span class="sprite-badge" title="${escapeHtml(node.spriteHint)}">${escapeHtml(
          node.spriteHint
        )}</span>`
      : '';

  let html = `<li data-uuid="${node.id}" class="${activeClass}${spriteClass}${
    isSelected ? ' selected' : ''
  }">
      <div class="node-tree-item">
        <span class="${toggleClass}">${toggle}</span>
        <span class="node-name${node.active ? '' : ' inactive-node'}">${escapeHtml(
          node.name
        )}</span>
        ${badge}
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
  if (node.spriteHint?.toLowerCase().includes(q)) return true;
  return node.children.some((c) => nodeMatchesSearch(c, q));
}

export function expandMatchingNodes(
  node: import('./sceneTree').TreeNodeInfo,
  q: string,
  expanded: Set<string>
): boolean {
  let matched =
    node.name.toLowerCase().includes(q) ||
    (node.spriteHint?.toLowerCase().includes(q) ?? false);

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
