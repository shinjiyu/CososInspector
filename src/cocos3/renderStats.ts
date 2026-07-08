/** 读取当前帧 DrawCall（多路径兼容 Cocos 3.x） */
export const readDrawCalls = (): number => {
  try {
    const ccg = window.cc as Record<string, unknown>;
    const profiler = ccg.profiler as
      | {
          stats?: {
            draw?: { counter?: number };
            draws?: { counter?: number };
          };
          getDrawCalls?: () => number;
        }
      | undefined;

    const drawCounter = profiler?.stats?.draw?.counter ?? profiler?.stats?.draws?.counter;
    if (drawCounter != null && !Number.isNaN(drawCounter)) {
      return Number(drawCounter);
    }
    if (typeof profiler?.getDrawCalls === 'function') {
      return Number(profiler.getDrawCalls());
    }

    const root = (ccg.director as { root?: { device?: Record<string, unknown> } })
      ?.root;
    const device = root?.device;
    if (device) {
      for (const key of ['numDrawCalls', '_numDrawCalls', 'drawCalls']) {
        const v = device[key];
        if (typeof v === 'number' && !Number.isNaN(v)) return v;
      }
    }
  } catch (error) {
    console.warn('[渲染统计] readDrawCalls 失败', error);
  }
  return -1;
};

/** 等待两帧后读取 DrawCall */
export const sampleDrawCalls = (): Promise<number> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve(readDrawCalls()));
    });
  });

const RENDER_UNIT_RE =
  /Sprite|Label|RichText|Graphics|Mask|UIMeshRenderer|MeshRenderer|SkinnedMesh|Spine|Particle|TileMap|DragonBones|TiledLayer|VideoPlayer|WebView/i;

export const isRenderableComponentName = (name: string): boolean =>
  RENDER_UNIT_RE.test(name);

/** 节点上可能产生 DrawCall 的组件数量（静态估算） */
export const countRenderUnitsOnNode = (node: cc.Node): number => {
  try {
    const comps =
      (node as cc.Node & { _components?: unknown[] })._components ?? [];
    let units = 0;
    for (const comp of comps) {
      const rec = comp as {
        enabled?: boolean;
        __classname__?: string;
        constructor?: { name?: string };
      };
      if (rec.enabled === false) continue;
      const cn =
        rec.__classname__ ?? rec.constructor?.name ?? '';
      if (RENDER_UNIT_RE.test(cn)) units += 1;
    }
    return units;
  } catch {
    return 0;
  }
};

/** 子树渲染单元估算（activeInHierarchy） */
export const estimateSubtreeRenderUnits = (root: cc.Node): number => {
  let total = 0;
  const walk = (node: cc.Node): void => {
    if (node.active === false) return;
    total += countRenderUnitsOnNode(node);
    for (const child of node.children ?? []) {
      if (child) walk(child);
    }
  };
  walk(root);
  return total;
};
