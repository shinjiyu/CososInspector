/**
 * 从快照节点解析 UITransform 尺寸（允许 0 宽/高，如 0×56、0×0）
 */

export const parseSizePair = (value) => {
  const m = String(value ?? '').match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return { width: +m[1], height: +m[2] };
};

export const isValidUiSize = (width, height) =>
  Number.isFinite(width) && Number.isFinite(height);

export const parseUiFromSnapshotNode = (ch) => {
  const ut = ch.uiTransform?.contentSize;
  if (ut && isValidUiSize(ut.width, ut.height)) {
    return {
      contentSize: { width: ut.width, height: ut.height },
      anchorPoint: ch.uiTransform.anchorPoint,
    };
  }

  const uiComp = (ch.components || []).find((c) => /UITransform/.test(c.typeName || ''));
  const sizeRow = uiComp?.rows?.find((r) => r.label === '内容尺寸');
  const size = parseSizePair(sizeRow?.value);
  if (size && isValidUiSize(size.width, size.height)) {
    const anchorRow = uiComp.rows?.find((r) => r.label === '锚点');
    let ax = 0.5;
    let ay = 0.5;
    if (anchorRow?.value) {
      const p = String(anchorRow.value)
        .split(',')
        .map((s) => parseFloat(s.trim()));
      if (p.length >= 2) {
        ax = p[0];
        ay = p[1];
      }
    }
    return { contentSize: size, anchorPoint: { x: ax, y: ay } };
  }

  const sp = (ch.components || []).find((c) => c.flags?.isSprite);
  const sizeModeRow = sp?.rows?.find((r) => r.label === '尺寸模式');
  const sizeMode = parseInt(String(sizeModeRow?.value ?? ''), 10);
  // CUSTOM(2) 必须用 UITransform，不能用图集纹理尺寸
  if (sp?.rows && sizeMode !== 2) {
    const texRow = sp.rows.find((r) => r.label === '纹理');
    const texSize = parseSizePair(texRow?.value);
    if (texSize && isValidUiSize(texSize.width, texSize.height)) {
      return { contentSize: texSize, anchorPoint: { x: 0.5, y: 0.5 } };
    }
  }

  return null;
};

export const parseSpriteSizeMode = (ch) => {
  const sf = ch.spriteFrame?.sizeMode;
  if (sf != null && Number.isFinite(sf)) return sf;

  const sp = (ch.components || []).find((c) => c.flags?.isSprite);
  const row = sp?.rows?.find((r) => r.label === '尺寸模式');
  const v = parseInt(String(row?.value ?? ''), 10);
  return Number.isFinite(v) ? v : null;
};

/** 从快照节点或 downloadTexture detail 归一化 spriteFrame 元数据 */
export const normalizeSpriteFrameMeta = (ch, detail) => {
  const sf = ch?.spriteFrame;
  const src = detail ?? sf;
  if (!src?.originalSize || !src?.frameRect) return null;
  const sizeModeRaw = src.sizeMode ?? sf?.sizeMode;
  const sizeMode = parseInt(String(sizeModeRaw ?? ''), 10);
  return {
    frameName: src.frameName ?? sf?.frameName ?? '',
    frameRect: { ...src.frameRect },
    offset: { ...(src.offset ?? sf?.offset ?? { x: 0, y: 0 }) },
    originalSize: { ...src.originalSize },
    displaySize: { ...(src.displaySize ?? sf?.displaySize ?? src.originalSize) },
    sizeMode: Number.isFinite(sizeMode) ? sizeMode : 0,
    isRotated: !!(src.isRotated ?? sf?.isRotated),
  };
};

export const indexSnapshotNodes = (root) => {
  const byId = {};
  const walk = (n) => {
    byId[n.id] = n;
    for (const ch of n.children || []) walk(ch);
  };
  walk(root);
  return byId;
};

export const collectUiSizeBindings = (snapshotRoot, pathMap) => {
  const bindings = [];
  const walk = (node) => {
    const relPath = node.path?.replace(/^main › /, '') ?? node.path;
    const keys = [relPath, node.path].filter(Boolean);
    let nodeUuid = null;
    for (const k of keys) {
      if (pathMap.has(k)) {
        nodeUuid = pathMap.get(k);
        break;
      }
    }
    const ui = parseUiFromSnapshotNode(node);
    if (nodeUuid && ui?.contentSize && isValidUiSize(ui.contentSize.width, ui.contentSize.height)) {
      bindings.push({
        nodeUuid,
        width: ui.contentSize.width,
        height: ui.contentSize.height,
      });
    }
    for (const ch of node.children || []) walk(ch);
  };
  walk(snapshotRoot);
  return bindings;
};
