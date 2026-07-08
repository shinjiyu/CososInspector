import {
  estimateSubtreeRenderUnits,
  readDrawCalls,
  sampleDrawCalls,
} from './renderStats';
import { buildNodePath, findNodeById, getNodeId, getSceneRoot } from './sceneTree';

export type PerfScanMode = 'quick' | 'standard' | 'fine';

export interface PerfScanConfig {
  /** 关子树后至少减少的 DrawCall 数 */
  minDcDrop: number;
  minRelativeDrop: number;
  maxDepth: number;
  maxTests: number;
  smallFanout: number;
  stabilizeMs: number;
  topK: number;
  /** 静态估算模式下展示的 Top N */
  topResults: number;
}

export interface PerfScanSuspect {
  nodeId: string;
  nodeName: string;
  path: string;
  dcDrop: number;
  depth: number;
  /** measured=实测关子树减 DC；estimated=渲染组件估算 */
  method: 'measured' | 'estimated';
}

export interface PerfScanProgress {
  phase: 'baseline' | 'scanning' | 'done' | 'error';
  message: string;
  testsDone: number;
  testsBudget: number;
  currentPath?: string;
}

export interface PerfScanReport {
  baselineDc: number;
  method: 'measured' | 'estimated';
  suspects: PerfScanSuspect[];
  /** nodeId → 关子树减少的 DC（或估算值） */
  dcByNodeId: Map<string, number>;
  testsDone: number;
  durationMs: number;
}

const MODE_PRESETS: Record<PerfScanMode, PerfScanConfig> = {
  quick: {
    minDcDrop: 3,
    minRelativeDrop: 0.15,
    maxDepth: 4,
    maxTests: 20,
    smallFanout: 5,
    stabilizeMs: 120,
    topK: 1,
    topResults: 8,
  },
  standard: {
    minDcDrop: 1,
    minRelativeDrop: 0.15,
    maxDepth: 8,
    maxTests: 40,
    smallFanout: 5,
    stabilizeMs: 150,
    topK: 1,
    topResults: 12,
  },
  fine: {
    minDcDrop: 1,
    minRelativeDrop: 0.1,
    maxDepth: 12,
    maxTests: 80,
    smallFanout: 8,
    stabilizeMs: 180,
    topK: 2,
    topResults: 20,
  },
};

export const getPerfScanConfig = (mode: PerfScanMode): PerfScanConfig => ({
  ...MODE_PRESETS[mode],
});

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export const snapshotActiveStates = (root: cc.Node): Map<string, boolean> => {
  const map = new Map<string, boolean>();
  const walk = (node: cc.Node): void => {
    map.set(getNodeId(node), node.active !== false);
    for (const child of node.children ?? []) {
      if (child) walk(child);
    }
  };
  walk(root);
  return map;
};

export const restoreActiveStates = (
  root: cc.Node,
  snapshot: Map<string, boolean>
): void => {
  const walk = (node: cc.Node): void => {
    const id = getNodeId(node);
    if (snapshot.has(id)) {
      node.active = snapshot.get(id)!;
    }
    for (const child of node.children ?? []) {
      if (child) walk(child);
    }
  };
  walk(root);
};

const getActiveChildren = (node: cc.Node): cc.Node[] =>
  [...(node.children ?? [])].filter((c) => c && c.active !== false);

const collectSubtreeNodes = (scene: cc.Node): cc.Node[] => {
  const list: cc.Node[] = [];
  const walk = (node: cc.Node): void => {
    list.push(node);
    for (const child of node.children ?? []) {
      if (child) walk(child);
    }
  };
  walk(scene);
  return list;
};

/** 静态模式：按子树渲染单元估算排名 */
const runEstimatedDcScan = (
  scene: cc.Node,
  config: PerfScanConfig,
  onProgress: (p: PerfScanProgress) => void
): PerfScanReport => {
  const startedAt = performance.now();
  const dcByNodeId = new Map<string, number>();
  const nodes = collectSubtreeNodes(scene).filter((n) => n !== scene);

  onProgress({
    phase: 'scanning',
    message: '估算各子树渲染单元…',
    testsDone: 0,
    testsBudget: nodes.length,
  });

  nodes.forEach((node, i) => {
    const units = estimateSubtreeRenderUnits(node);
    if (units > 0) {
      dcByNodeId.set(getNodeId(node), units);
    }
    if (i % 50 === 0) {
      onProgress({
        phase: 'scanning',
        message: `估算渲染单元 ${i}/${nodes.length}`,
        testsDone: i,
        testsBudget: nodes.length,
      });
    }
  });

  const suspects = [...dcByNodeId.entries()]
    .map(([nodeId, dcDrop]) => ({
      nodeId,
      nodeName: findNodeById(scene, nodeId)?.name ?? '(unnamed)',
      path: buildNodePath(scene, nodeId),
      dcDrop,
      depth: 0,
      method: 'estimated' as const,
    }))
    .sort((a, b) => b.dcDrop - a.dcDrop)
    .slice(0, config.topResults);

  return {
    baselineDc: readDrawCalls() >= 0 ? readDrawCalls() : 0,
    method: 'estimated',
    suspects,
    dcByNodeId,
    testsDone: nodes.length,
    durationMs: performance.now() - startedAt,
  };
};

export const runPerfScan = async (
  mode: PerfScanMode,
  onProgress: (p: PerfScanProgress) => void,
  shouldCancel: () => boolean
): Promise<PerfScanReport | null> => {
  const config = getPerfScanConfig(mode);
  const scene = getSceneRoot();
  if (!scene) {
    onProgress({
      phase: 'error',
      message: '场景未就绪',
      testsDone: 0,
      testsBudget: config.maxTests,
    });
    return null;
  }

  onProgress({
    phase: 'baseline',
    message: '采集基准 DrawCall…',
    testsDone: 0,
    testsBudget: config.maxTests,
  });

  const baselineProbe = await sampleDrawCalls();
  if (baselineProbe < 0) {
    const report = runEstimatedDcScan(scene, config, onProgress);
    const top = report.suspects[0];
    onProgress({
      phase: 'done',
      message: top
        ? `完成(估算) · Top: ${top.nodeName} ~${top.dcDrop} 渲染单元`
        : '完成(估算) · 未发现高 DC 子树',
      testsDone: report.testsDone,
      testsBudget: report.testsDone,
      currentPath: top?.path,
    });
    return report;
  }

  const snapshot = snapshotActiveStates(scene);
  const dcByNodeId = new Map<string, number>();
  const suspects: PerfScanSuspect[] = [];
  let testsDone = 0;
  const startedAt = performance.now();
  const baselineDc = baselineProbe;

  const recordDrop = (
    node: cc.Node,
    drop: number,
    depth: number,
    method: 'measured' | 'estimated'
  ): void => {
    const nodeId = getNodeId(node);
    const prev = dcByNodeId.get(nodeId) ?? 0;
    if (drop > prev) {
      dcByNodeId.set(nodeId, drop);
    }
    if (drop >= config.minDcDrop) {
      suspects.push({
        nodeId,
        nodeName: node.name || '(unnamed)',
        path: buildNodePath(scene, nodeId),
        dcDrop: drop,
        depth,
        method,
      });
    }
  };

  try {
    const measureDisabledDrop = async (target: cc.Node): Promise<number> => {
      restoreActiveStates(scene, snapshot);
      target.active = false;
      await sleep(config.stabilizeMs);
      const dc = await sampleDrawCalls();
      restoreActiveStates(scene, snapshot);
      if (dc < 0) return 0;
      return Math.max(0, baselineDc - dc);
    };

    const scanParent = async (
      parent: cc.Node,
      depth: number,
      parentDrop: number | null
    ): Promise<void> => {
      if (shouldCancel()) return;
      if (depth >= config.maxDepth || testsDone >= config.maxTests) return;

      const children = getActiveChildren(parent);
      if (children.length === 0) return;

      const childResults: Array<{ child: cc.Node; drop: number }> = [];

      for (const child of children) {
        if (shouldCancel()) return;
        if (testsDone >= config.maxTests) break;

        const nodeId = getNodeId(child);
        const nodeName = child.name || '(unnamed)';
        const path = buildNodePath(scene, nodeId);

        onProgress({
          phase: 'scanning',
          message: `测 DC ${path}`,
          testsDone,
          testsBudget: config.maxTests,
          currentPath: path,
        });

        const drop = await measureDisabledDrop(child);
        testsDone += 1;
        recordDrop(child, drop, depth, 'measured');
        childResults.push({ child, drop });

        console.log(
          `[DC扫描] ${nodeName}(${nodeId}) 关子树 -${drop} DC (基准 ${baselineDc})`
        );
      }

      childResults.sort((a, b) => b.drop - a.drop);
      const levelBest = childResults[0]?.drop ?? 0;

      let winners = childResults.filter((r) => r.drop >= config.minDcDrop);
      if (parentDrop !== null && parentDrop > 0) {
        winners = winners.filter(
          (r) => r.drop >= parentDrop * config.minRelativeDrop
        );
      } else if (levelBest > 0) {
        winners = winners.filter(
          (r) => r.drop >= levelBest * config.minRelativeDrop
        );
      }

      const topK = winners.slice(0, config.topK);
      for (const { child, drop } of topK) {
        await scanParent(child, depth + 1, drop);
      }
    };

    onProgress({
      phase: 'scanning',
      message: `基准 ${baselineDc} DC · 扫描顶层子节点…`,
      testsDone: 0,
      testsBudget: config.maxTests,
    });

    await scanParent(scene, 0, null);
    restoreActiveStates(scene, snapshot);

    const deduped = suspects
      .sort((a, b) => b.dcDrop - a.dcDrop)
      .filter(
        (s, i, arr) => arr.findIndex((x) => x.nodeId === s.nodeId) === i
      )
      .slice(0, config.topResults);

    const report: PerfScanReport = {
      baselineDc,
      method: 'measured',
      suspects: deduped,
      dcByNodeId,
      testsDone,
      durationMs: performance.now() - startedAt,
    };

    const top = deduped[0];
    onProgress({
      phase: 'done',
      message: top
        ? `完成 · 基准 ${baselineDc} DC · Top: ${top.nodeName} -${top.dcDrop} DC`
        : `完成 · 基准 ${baselineDc} DC · 未发现高 DC 子树`,
      testsDone,
      testsBudget: config.maxTests,
      currentPath: top?.path,
    });

    return report;
  } catch (error) {
    restoreActiveStates(scene, snapshot);
    console.error('[DC扫描] 扫描失败', error);
    onProgress({
      phase: 'error',
      message: error instanceof Error ? error.message : '扫描失败',
      testsDone,
      testsBudget: config.maxTests,
    });
    return null;
  }
};

export const expandSuspectPaths = (
  scene: cc.Node,
  dcByNodeId: Map<string, number>,
  expanded: Set<string>,
  minDrop: number
): void => {
  for (const [nodeId, drop] of dcByNodeId) {
    if (drop < minDrop) continue;
    const walkUp = (id: string): void => {
      expanded.add(id);
      const node = findNodeById(scene, id);
      const parent = node?.parent;
      if (parent && parent !== scene) {
        walkUp(getNodeId(parent));
      }
    };
    walkUp(nodeId);
  }
};
