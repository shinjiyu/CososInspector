import { findNodeById, getSceneRoot } from './sceneTree';

export interface RecoveredProperty {
  name: string;
  tsType: string;
  defaultValue: string;
  runtimeValue: string;
}

export interface RecoveredScript {
  className: string;
  nodeId: string;
  nodeName: string;
  properties: RecoveredProperty[];
  /** 编译后类/构造函数 toString */
  compiledSource: string;
  /** 生成的 TS 草稿 */
  tsDraft: string;
  /** 元数据路径（若可读） */
  metaHints: string[];
}

const ENGINE_RE =
  /^(cc\.|dragonBones\.|sp\.|ParticleSystem|UITransform|UIOpacity|Widget|Canvas|Camera|Light)/;

const SKIP_KEYS = new Set([
  'node',
  'enabled',
  '__eventTargets',
  '_objFlags',
  '_enabled',
  '_name',
  '_id',
  'uuid',
  '__classname__',
]);

export const isCustomComponentName = (typeName: string): boolean => {
  const short = typeName.replace(/^cc\./, '').split('.').pop() ?? typeName;
  if (ENGINE_RE.test(typeName) || ENGINE_RE.test(short)) return false;
  if (short === 'Component' || short.endsWith('Renderer')) return false;
  return true;
};

const inferTsType = (value: unknown, key: string): string => {
  if (value == null) return 'unknown';
  const t = typeof value;
  if (t === 'boolean') return 'boolean';
  if (t === 'number') return 'number';
  if (t === 'string') return 'string';
  if (Array.isArray(value)) return 'unknown[]';

  if (t === 'object') {
    const o = value as {
      __classname__?: string;
      constructor?: { name?: string };
      name?: string;
    };
    const cn =
      o.__classname__ ??
      o.constructor?.name ??
      '';
    if (/Node/.test(cn) || key.toLowerCase().includes('node')) return 'Node';
    if (/SpriteFrame/.test(cn)) return 'SpriteFrame';
    if (/Texture/.test(cn)) return 'Texture2D';
    if (/Material/.test(cn)) return 'Material';
    if (/Prefab/.test(cn)) return 'Prefab';
    if (/Vec2/.test(cn)) return 'Vec2';
    if (/Vec3/.test(cn)) return 'Vec3';
    if (/Color/.test(cn)) return 'Color';
    if (cn) return cn.replace(/^cc\./, '');
    return 'unknown';
  }

  return 'unknown';
};

const formatDefault = (value: unknown, tsType: string): string => {
  if (value == null) return 'null';
  if (tsType === 'boolean') return String(value);
  if (tsType === 'number') return String(value);
  if (tsType === 'string') return `'${String(value).replace(/'/g, "\\'")}'`;
  if (tsType === 'Node') return 'null';
  return 'null';
};

const formatRuntime = (value: unknown): string => {
  if (value == null) return 'null';
  if (typeof value === 'object') {
    const o = value as {
      name?: string;
      __classname__?: string;
      constructor?: { name?: string };
      uuid?: string;
    };
    const label = o.name ?? o.__classname__ ?? o.constructor?.name ?? 'object';
    const id = o.uuid ? `(${o.uuid.slice(0, 8)})` : '';
    return `${label}${id}`;
  }
  return String(value);
};

const getClassByName = (className: string): unknown => {
  const ccg = window.cc as Record<string, unknown>;
  const js = ccg.js as { getClassByName?: (n: string) => unknown } | undefined;
  if (typeof js?.getClassByName === 'function') {
    try {
      return js.getClassByName(className);
    } catch {
      /* ignore */
    }
  }
  const legacy = ccg.js as { _getClassById?: (n: string) => unknown } | undefined;
  if (typeof legacy?._getClassById === 'function') {
    try {
      return legacy._getClassById(className);
    } catch {
      /* ignore */
    }
  }
  return null;
};

const readCompiledSource = (className: string, comp: unknown): string => {
  const parts: string[] = [];
  const cls = getClassByName(className) ?? (comp as { constructor?: unknown })
    ?.constructor;
  if (cls && typeof cls === 'function') {
    try {
      parts.push((cls as { toString: () => string }).toString());
    } catch {
      /* ignore */
    }
  }
  const proto = (comp as { constructor?: { prototype?: unknown } }).constructor
    ?.prototype;
  if (proto && typeof proto === 'object') {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor') continue;
      const desc = Object.getOwnPropertyDescriptor(proto, key);
      if (desc?.value && typeof desc.value === 'function') {
        try {
          parts.push(
            `// --- ${key} ---\n${(desc.value as { toString: () => string }).toString()}`
          );
        } catch {
          /* ignore */
        }
      }
    }
  }
  return parts.join('\n\n');
};

const readMetaHints = (className: string): string[] => {
  const hints: string[] = [];
  const cls = getClassByName(className) as
    | {
        __props__?: Array<{ name?: string; type?: string }>;
        __values__?: Record<string, unknown>;
        __attrs__?: Record<string, { type?: string }>;
      }
    | null;
  if (!cls) return hints;

  if (Array.isArray(cls.__props__)) {
    for (const p of cls.__props__) {
      if (p?.name) hints.push(`__props__: ${p.name} : ${p.type ?? '?'}`);
    }
  }
  if (cls.__attrs__) {
    for (const [k, v] of Object.entries(cls.__attrs__)) {
      hints.push(`__attrs__: ${k} : ${v?.type ?? '?'}`);
    }
  }
  return hints;
};

const collectProperties = (comp: unknown): RecoveredProperty[] => {
  const c = comp as Record<string, unknown>;
  const props: RecoveredProperty[] = [];
  const seen = new Set<string>();

  const add = (key: string, value: unknown): void => {
    if (seen.has(key) || SKIP_KEYS.has(key) || key.startsWith('_')) return;
    if (typeof value === 'function') return;
    seen.add(key);
    const tsType = inferTsType(value, key);
    props.push({
      name: key,
      tsType,
      defaultValue: formatDefault(value, tsType),
      runtimeValue: formatRuntime(value),
    });
  };

  for (const key of Object.keys(c)) add(key, c[key]);

  const proto = (comp as { constructor?: { prototype?: unknown } }).constructor
    ?.prototype;
  if (proto && typeof proto === 'object') {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (SKIP_KEYS.has(key) || key.startsWith('_')) continue;
      try {
        add(key, (comp as Record<string, unknown>)[key]);
      } catch {
        /* ignore */
      }
    }
  }

  return props.sort((a, b) => a.name.localeCompare(b.name));
};

const needsCcImport = (props: RecoveredProperty[]): string[] => {
  const types = new Set(props.map((p) => p.tsType));
  const imports = ['_decorator', 'Component'];
  const map: Record<string, string> = {
    Node: 'Node',
    SpriteFrame: 'SpriteFrame',
    Texture2D: 'Texture2D',
    Material: 'Material',
    Prefab: 'Prefab',
    Vec2: 'Vec2',
    Vec3: 'Vec3',
    Color: 'Color',
  };
  for (const [ts, cc] of Object.entries(map)) {
    if (types.has(ts)) imports.push(cc);
  }
  return imports;
};

export const generateTsDraft = (
  className: string,
  properties: RecoveredProperty[],
  compiledSource: string,
  metaHints: string[]
): string => {
  const imports = needsCcImport(properties);
  const propLines = properties
    .map((p) => `  @property\n  ${p.name}: ${p.tsType} = ${p.defaultValue};`)
    .join('\n\n');

  const hintBlock =
    metaHints.length > 0
      ? `// 元数据提示:\n${metaHints.map((h) => `// ${h}`).join('\n')}\n\n`
      : '';

  const compiledBlock = compiledSource
    ? `/*\n * --- 运行时编译代码（逆向参考，需人工整理）---\n */\n/*\n${compiledSource
        .slice(0, 12000)
        .replace(/\*\//g, '* /')}\n*/\n`
    : '';

  return `${hintBlock}${compiledBlock}import { ${imports.join(', ')} } from 'cc';

const { ccclass, property } = _decorator;

/**
 * 由 Cocos Inspector 从运行时还原的草稿，非原始源码。
 * 请对照编译代码块手工整理逻辑。
 */
@ccclass('${className}')
export class ${className} extends Component {
${propLines || '  // 未读取到公开属性'}
}
`;
};

const resolveClassName = (comp: unknown): string => {
  const rec = comp as {
    __classname__?: string;
    constructor?: { name?: string };
  };
  const full = rec.__classname__ ?? rec.constructor?.name ?? 'Unknown';
  return full.replace(/^cc\./, '').split('.').pop() ?? full;
};

const findComponentOnNode = (
  node: cc.Node,
  className: string
): unknown | null => {
  const comps = (node as cc.Node & { _components?: unknown[] })._components ?? [];
  for (const comp of comps) {
    if (resolveClassName(comp) === className) return comp;
  }
  if (typeof node.getComponent === 'function') {
    try {
      return node.getComponent(className as never);
    } catch {
      /* ignore */
    }
  }
  return null;
};

export const recoverComponentScript = (
  nodeId: string,
  className: string
): RecoveredScript | null => {
  try {
    const scene = getSceneRoot();
    if (!scene) return null;

    const node = findNodeById(scene, nodeId);
    if (!node) return null;

    const comp = findComponentOnNode(node, className);
    if (!comp) return null;

    const resolvedName = resolveClassName(comp);
    const properties = collectProperties(comp);
    const compiledSource = readCompiledSource(resolvedName, comp);
    const metaHints = readMetaHints(resolvedName);
    const tsDraft = generateTsDraft(
      resolvedName,
      properties,
      compiledSource,
      metaHints
    );

    const nodeName = node.name || '(unnamed)';
    console.log(
      `[脚本还原] ${resolvedName} on ${nodeName}(${nodeId}) · ${properties.length} 属性`
    );

    return {
      className: resolvedName,
      nodeId,
      nodeName,
      properties,
      compiledSource,
      tsDraft,
      metaHints,
    };
  } catch (error) {
    console.error('[脚本还原] recoverComponentScript 失败', error);
    return null;
  }
};

export const downloadRecoveredScript = (data: RecoveredScript): void => {
  const blob = new Blob([data.tsDraft], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.className}.recovered.ts`;
  a.click();
  URL.revokeObjectURL(url);
};

export const copyRecoveredScript = async (
  data: RecoveredScript
): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(data.tsDraft);
    return true;
  } catch (error) {
    console.warn('[脚本还原] 剪贴板写入失败', error);
    return false;
  }
};
