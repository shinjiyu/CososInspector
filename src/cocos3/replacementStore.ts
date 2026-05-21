import {
  buildMatchKeys,
  type OriginalSpriteSnapshot,
  type ReplacementRecordInput,
} from './replacementMeta';

const LEGACY_DB_NAME = 'CocosInspector3Replacements';

/** 仅当前标签页会话有效，刷新页面即清空（与运行时 Sprite 替换一致） */
const sessionByPage = new Map<string, Map<string, StoredRow>>();

export interface StoredReplacementPair {
  id: string;
  pageUrl: string;
  recordedAt: number;
  nodeId: string;
  nodeName: string;
  nodePath: string;
  original: OriginalSpriteSnapshot;
  matchKeys: string[];
  replacement: {
    fileName: string;
    mimeType: string;
    width: number;
    height: number;
    exportFileName: string;
  };
}

interface StoredRow extends StoredReplacementPair {
  imageBlob: Blob;
}

function pageKey(): string {
  return `${location.origin}${location.pathname}`;
}

function getPageMap(): Map<string, StoredRow> {
  const key = pageKey();
  let map = sessionByPage.get(key);
  if (!map) {
    map = new Map();
    sessionByPage.set(key, map);
  }
  return map;
}

function safeExportName(nodePath: string, fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '') || 'image';
  const slug = nodePath
    .replace(/[››]/g, '_')
    .replace(/[^\w\u4e00-\u9fff.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
  const ext = (fileName.match(/\.(png|jpe?g|webp)$/i) ?? ['', 'png'])[1].toLowerCase();
  const normExt = ext === 'jpg' ? 'jpeg' : ext;
  return `${slug || 'node'}__${base}.${normExt === 'jpeg' ? 'jpg' : normExt}`;
}

/** 删除旧版 IndexedDB（升级后只保留内存会话，避免刷新后仍显示无效历史） */
export function discardLegacyReplacementDatabase(): void {
  try {
    indexedDB.deleteDatabase(LEGACY_DB_NAME);
  } catch {
    /* ignore */
  }
}

export async function saveReplacementPair(
  input: ReplacementRecordInput
): Promise<StoredReplacementPair> {
  const map = getPageMap();
  const prev = [...map.values()].find((p) => p.nodeId === input.nodeId);

  const id = prev?.id ?? `rp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const exportFileName = safeExportName(input.nodePath, input.fileName);
  const matchKeys = buildMatchKeys(input.original);

  const row: StoredRow = {
    id,
    pageUrl: pageKey(),
    recordedAt: Date.now(),
    nodeId: input.nodeId,
    nodeName: input.nodeName,
    nodePath: input.nodePath,
    original: input.original,
    matchKeys,
    replacement: {
      fileName: input.fileName,
      mimeType: input.mimeType,
      width: input.width,
      height: input.height,
      exportFileName,
    },
    imageBlob: input.imageBlob,
  };

  map.set(id, row);
  const { imageBlob: _, ...meta } = row;
  return meta;
}

export async function listReplacementPairs(): Promise<StoredReplacementPair[]> {
  const map = sessionByPage.get(pageKey());
  if (!map) return [];
  return [...map.values()]
    .map(({ imageBlob: _, ...meta }) => meta)
    .sort((a, b) => b.recordedAt - a.recordedAt);
}

export async function getReplacementBlob(id: string): Promise<Blob | null> {
  const map = sessionByPage.get(pageKey());
  return map?.get(id)?.imageBlob ?? null;
}

export async function deleteReplacementPair(id: string): Promise<void> {
  sessionByPage.get(pageKey())?.delete(id);
}

export async function clearReplacementPairsForPage(): Promise<void> {
  sessionByPage.delete(pageKey());
}

export async function countReplacementPairs(): Promise<number> {
  return (await listReplacementPairs()).length;
}
