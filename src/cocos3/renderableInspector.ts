import { isCustomComponentName } from './scriptRecover';
import { findNodeById, getSceneRoot } from './sceneTree';
export interface InspectRow {
  label: string;
  value: string;
}

export interface ComponentInspectInfo {
  typeName: string;
  shortName: string;
  compId: string;
  enabled: boolean;
  rows: InspectRow[];
  isSprite: boolean;
  isCustom: boolean;
  isSpine: boolean;
  recoverClassName: string;
  spineIndex: number;
}

export interface NodeInspectorData {
  nodeId: string;
  nodeName: string;
  components: ComponentInspectInfo[];
}

type CompRecord = Record<string, unknown>;

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const getComponentName = (comp: unknown): string => {
  const rec = comp as {
    __classname__?: string;
    constructor?: { name?: string };
  };
  return rec.__classname__ ?? rec.constructor?.name ?? 'Component';
};

const shortTypeName = (full: string): string => {
  const base = full.replace(/^cc\./, '');
  const parts = base.split('.');
  return parts[parts.length - 1] ?? base;
};

const readColor = (color: unknown): string => {
  if (!color || typeof color !== 'object') return '-';
  const c = color as { r?: number; g?: number; b?: number; a?: number };
  const r = Math.round((c.r ?? 0) * 255);
  const g = Math.round((c.g ?? 0) * 255);
  const b = Math.round((c.b ?? 0) * 255);
  const a = c.a ?? 1;
  return `rgba(${r},${g},${b},${a.toFixed(2)})`;
};

const readSize = (v: unknown): string => {
  if (!v || typeof v !== 'object') return '-';
  const s = v as { width?: number; height?: number; x?: number; y?: number };
  const w = s.width ?? s.x;
  const h = s.height ?? s.y;
  if (w == null && h == null) return '-';
  return `${Math.round(w ?? 0)}×${Math.round(h ?? 0)}`;
};

const frameName = (frame: unknown): string => {
  if (!frame || typeof frame !== 'object') return '(无贴图)';
  const f = frame as { name?: string; _name?: string };
  return f.name || f._name || '(无贴图)';
};

const meshName = (mesh: unknown): string => {
  if (!mesh || typeof mesh !== 'object') return '-';
  const m = mesh as { name?: string; _name?: string };
  return m.name || m._name || '(mesh)';
};

const readVec2 = (v: unknown): string => {
  if (!v || typeof v !== 'object') return '-';
  const p = v as { x?: number; y?: number };
  return `${(p.x ?? 0).toFixed(2)}, ${(p.y ?? 0).toFixed(2)}`;
};

const formatPrimitive = (value: unknown): string => {
  if (value == null) return '-';
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return value.length > 64 ? `${value.slice(0, 64)}…` : value;
  }
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === 'object') {
    const o = value as { name?: string; _name?: string; uuid?: string };
    if (o.name || o._name) return o.name || o._name || '(object)';
    if (o.uuid) return o.uuid.slice(0, 8);
    return '(object)';
  }
  return String(value);
};

const extractGenericRows = (comp: unknown): InspectRow[] => {
  const c = comp as CompRecord;
  const skip = new Set([
    'node',
    '__eventTargets',
    '_objFlags',
    '_enabled',
    'enabled',
  ]);
  const rows: InspectRow[] = [];

  for (const key of Object.keys(c)) {
    if (key.startsWith('_') || skip.has(key)) continue;
    const val = c[key];
    if (typeof val === 'function') continue;
    rows.push({ label: key, value: formatPrimitive(val) });
    if (rows.length >= 16) break;
  }

  return rows;
};

const getCompId = (comp: unknown, index: number): string => {
  const rec = comp as { uuid?: string; _id?: string };
  return rec.uuid ?? rec._id ?? `idx-${index}`;
};

const extractRows = (comp: unknown, typeName: string): InspectRow[] => {
  const c = comp as CompRecord;

  if (/Sprite/.test(typeName)) {
    const frame = c.spriteFrame;
    const texture =
      (frame as CompRecord | null | undefined)?.texture ??
      (frame as CompRecord | null | undefined)?._texture;
    const tex = texture as { width?: number; height?: number } | null | undefined;
    return [
      { label: '贴图', value: frameName(frame) },
      {
        label: '纹理',
        value: tex ? `${tex.width ?? 0}×${tex.height ?? 0}` : '-',
      },
      { label: '类型', value: String(c.type ?? '-') },
      { label: '尺寸模式', value: String(c.sizeMode ?? '-') },
      { label: '颜色', value: readColor(c.color) },
    ];
  }

  if (/Label/.test(typeName) && !/RichText/.test(typeName)) {
    const text = String(c.string ?? c._string ?? '');
    return [
      {
        label: '文本',
        value: text.length > 48 ? `${text.slice(0, 48)}…` : text || '(空)',
      },
      { label: '字号', value: String(c.fontSize ?? '-') },
      { label: '颜色', value: readColor(c.color) },
      { label: '溢出', value: String(c.overflow ?? '-') },
    ];
  }

  if (/RichText/.test(typeName)) {
    const text = String(c.string ?? c._string ?? '');
    return [
      {
        label: '文本',
        value: text.length > 48 ? `${text.slice(0, 48)}…` : text || '(空)',
      },
      { label: '字号', value: String(c.fontSize ?? '-') },
    ];
  }

  if (/Graphics/.test(typeName)) {
    return [
      { label: '线宽', value: String(c.lineWidth ?? '-') },
      { label: '填充', value: readColor(c.fillColor) },
      { label: '描边', value: readColor(c.strokeColor) },
    ];
  }

  if (/Mask/.test(typeName)) {
    return [
      { label: '类型', value: String(c.type ?? '-') },
      { label: '反向', value: c.inverted ? '是' : '否' },
    ];
  }

  if (/MeshRenderer|SkinnedMesh/.test(typeName)) {
    const materials = c.sharedMaterials ?? c.materials;
    const matCount = Array.isArray(materials) ? materials.length : 0;
    return [
      { label: 'Mesh', value: meshName(c.mesh ?? c._mesh) },
      { label: '材质数', value: String(matCount) },
      { label: '阴影', value: String(c.shadowCastingMode ?? '-') },
    ];
  }

  if (/Spine/.test(typeName)) {
    const data = c.skeletonData ?? c._skeletonData;
    return [
      { label: '骨架', value: frameName(data) },
      { label: '动画', value: String(c.animation ?? c.defaultAnimation ?? '-') },
    ];
  }

  if (/Particle/.test(typeName)) {
    return [
      { label: '容量', value: String(c.capacity ?? '-') },
      { label: '播放', value: c.playOnAwake === false ? '否' : '是' },
    ];
  }

  if (/UITransform/.test(typeName)) {
    return [
      { label: '内容尺寸', value: readSize(c.contentSize) },
      { label: '锚点', value: readVec2(c.anchorPoint) },
    ];
  }

  if (/Widget/.test(typeName)) {
    return [
      { label: '对齐', value: String(c.alignMode ?? '-') },
      { label: '左', value: String(c.isAlignLeft ? c.left : '-') },
      { label: '右', value: String(c.isAlignRight ? c.right : '-') },
      { label: '上', value: String(c.isAlignTop ? c.top : '-') },
      { label: '下', value: String(c.isAlignBottom ? c.bottom : '-') },
    ];
  }

  if (/Button/.test(typeName)) {
    return [
      { label: '可交互', value: c.interactable === false ? '否' : '是' },
      { label: '过渡', value: String(c.transition ?? '-') },
    ];
  }

  const generic = extractGenericRows(comp);
  if (generic.length > 0) return generic;

  return [{ label: '状态', value: c.enabled === false ? '禁用' : '启用' }];
};

const isSpineSkeletonType = (typeName: string): boolean =>
  /Skeleton/.test(typeName) && !/SkeletonData/.test(typeName);

const getNodeComponents = (node: cc.Node): unknown[] => {
  const n = node as cc.Node & {
    _components?: unknown[];
    getComponents?: (type: unknown) => unknown[];
  };
  if (Array.isArray(n._components) && n._components.length > 0) {
    return n._components;
  }
  const Component = (window.cc as { Component?: unknown }).Component;
  if (typeof n.getComponents === 'function' && Component) {
    try {
      const list = n.getComponents(Component);
      if (Array.isArray(list) && list.length > 0) return list;
    } catch {
      /* getComponents 不可用 */
    }
  }
  return n._components ?? [];
};

export const collectNodeInspectorData = (
  nodeId: string | null
): NodeInspectorData | null => {
  if (!nodeId) return null;

  const scene = getSceneRoot();
  if (!scene) return null;

  const node = findNodeById(scene, nodeId);
  if (!node) return null;

  const components: ComponentInspectInfo[] = [];
  const nameCount = new Map<string, number>();
  let spineCounter = 0;

  getNodeComponents(node).forEach((comp, index) => {
    const typeName = getComponentName(comp);
    const shortName = shortTypeName(typeName);
    const enabled = (comp as { enabled?: boolean }).enabled !== false;
    const count = (nameCount.get(shortName) ?? 0) + 1;
    nameCount.set(shortName, count);
    const displayName = count > 1 ? `${shortName} #${count}` : shortName;

    const baseRecoverName = shortTypeName(typeName);

    const isSpine = isSpineSkeletonType(typeName);
    const spineIndex = isSpine ? spineCounter++ : -1;

    components.push({
      typeName,
      shortName: displayName,
      compId: getCompId(comp, index),
      enabled,
      rows: extractRows(comp, typeName),
      isSprite: /Sprite/.test(typeName) && !/SpriteRenderer/.test(typeName),
      isCustom: isCustomComponentName(typeName),
      isSpine,
      recoverClassName: baseRecoverName,
      spineIndex,
    });
  });

  return {
    nodeId,
    nodeName: node.name || '(unnamed)',
    components,
  };
};

export const hashNodeInspectorData = (
  data: NodeInspectorData | null
): string => {
  if (!data) return '';
  const parts = data.components.map(
    (c) =>
      `${c.compId}:${c.shortName}:${c.enabled ? 1 : 0}:${c.rows
        .map((r) => `${r.label}=${r.value}`)
        .join('|')}`
  );
  return `${data.nodeId};${parts.join(';')}`;
};

export const renderNodeInspectorHtml = (
  data: NodeInspectorData | null
): string => {
  if (!data) {
    return `<div class="node-inspector-empty">选中节点以查看 Inspector</div>`;
  }

  if (data.components.length === 0) {
    return `<div class="node-inspector-empty">当前节点无组件</div>`;
  }

  const blocks = data.components
    .map((comp) => {
      const rows = comp.rows
        .map(
          (r) =>
            `<div class="insp-row"><span class="insp-label">${escapeHtml(
              r.label
            )}</span><span class="insp-value">${escapeHtml(r.value)}</span></div>`
        )
        .join('');

      const preview = comp.isSprite
        ? `<div class="insp-sprite-preview">
            <canvas class="insp-sprite-canvas" width="1" height="1"></canvas>
            <span class="insp-sprite-loading">加载预览…</span>
          </div>`
        : '';

      const stateBadge = comp.enabled
        ? '<span class="insp-badge insp-badge-on">启用</span>'
        : '<span class="insp-badge insp-badge-off">禁用</span>';

      const recoverBtn = comp.isCustom
        ? `<button type="button" class="insp-recover-btn" data-class="${escapeHtml(
            comp.recoverClassName
          )}" title="从运行时还原 TS 草稿">还原 TS</button>`
        : '';

      const spineBtn = comp.isSpine
        ? `<button type="button" class="insp-export-spine-btn" data-spine-idx="${comp.spineIndex}" title="从内存导出 Spine zip（纹理名与 atlas 页一致，支持多页）">导出 Spine</button>`
        : '';

      return `<section class="insp-comp-block" data-comp="${escapeHtml(
        comp.shortName
      )}">
        <header class="insp-comp-header">
          <span class="insp-comp-name">${escapeHtml(comp.shortName)}</span>
          <span class="insp-comp-actions">${spineBtn}${recoverBtn}${stateBadge}</span>
        </header>
        <div class="insp-comp-body">${rows}${preview}</div>
      </section>`;
    })
    .join('');

  return `<div class="node-inspector-scroll">${blocks}</div>`;
};

export const createNodeInspectorElement = (): HTMLElement => {
  const el = document.createElement('div');
  el.className = 'node-inspector-panel';
  el.innerHTML = `
    <div class="node-inspector-title">Inspector</div>
    <div class="node-inspector-body">
      <div class="node-inspector-empty">选中节点以查看 Inspector</div>
    </div>
  `;
  return el;
};
