import { buildNodePath, getNodeId } from './sceneTree';
import { getSpriteMeta, nodeHasSprite } from './sprite';

export interface SpriteListItem {
  id: string;
  name: string;
  path: string;
  frameName: string;
  enabled: boolean;
  active: boolean;
  searchText: string;
}

/** 有 Sprite 组件且已绑定贴图（排除「无贴图」） */
export function nodeHasSpriteTexture(node: cc.Node): boolean {
  if (!nodeHasSprite(node)) return false;
  const meta = getSpriteMeta(node);
  return !!meta && meta.frameName !== '(无贴图)';
}

/** 扁平收集场景中所有带贴图的 Sprite 节点 */
export function collectSpriteList(scene: cc.Node): SpriteListItem[] {
  const items: SpriteListItem[] = [];

  const walk = (node: cc.Node): void => {
    if (nodeHasSpriteTexture(node)) {
      const meta = getSpriteMeta(node)!;
      const id = getNodeId(node);
      const path = buildNodePath(scene, id);
      const searchText = `${node.name} ${path} ${meta.frameName}`.toLowerCase();
      items.push({
        id,
        name: node.name || '(unnamed)',
        path,
        frameName: meta.frameName,
        enabled: meta.enabled,
        active: node.active !== false,
        searchText,
      });
    }

    const children = [...(node.children ?? [])]
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    for (const child of children) {
      walk(child);
    }
  };

  walk(scene);
  items.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
  return items;
}

export function filterSpriteList(
  items: SpriteListItem[],
  query: string
): SpriteListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => it.searchText.includes(q));
}

export function hashSpriteList(items: SpriteListItem[]): string {
  return items
    .map(
      (it) =>
        `${it.id}:${it.frameName}:${it.active ? 1 : 0}:${it.enabled ? 1 : 0}`
    )
    .join('|');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

export function renderSpriteListHtml(
  items: SpriteListItem[],
  selectedId: string | null
): string {
  if (items.length === 0) {
    return '<div class="empty-scene">未找到带贴图的 Sprite 节点</div>';
  }

  const rows = items
    .map((it) => {
      const selected = it.id === selectedId ? ' selected' : '';
      const inactive = !it.active ? ' node-inactive' : '';
      const disabled = !it.enabled ? ' sprite-item-disabled' : '';
      return `<li class="sprite-list-item${selected}${inactive}${disabled}" data-uuid="${escapeAttr(it.id)}">
  <span class="sprite-list-thumb" data-thumb-for="${escapeAttr(it.id)}" title="贴图预览"></span>
  <span class="sprite-list-body">
    <span class="sprite-list-title">
      <span class="sprite-list-name">${escapeHtml(it.name)}</span>
      <span class="sprite-list-frame">${escapeHtml(it.frameName)}</span>
    </span>
    <span class="sprite-list-path">${escapeHtml(it.path)}</span>
  </span>
</li>`;
    })
    .join('');

  return `<ul class="sprite-list">${rows}</ul>`;
}
