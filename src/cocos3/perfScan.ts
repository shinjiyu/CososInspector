import { buildNodePath, findNodeById, getNodeId, getSceneRoot } from './sceneTree';

export type PerfScanMode = 'quick' | 'standard' | 'fine';

export interface PerfScanConfig {
  minFpsGain: number;
  minRelativeGain: number;
  maxDepth: number;
  maxTests: number;
  smallFanout: number;
  sampleMs: number;
  stabilizeMs: number;
  sampleRounds: number;
  topK: number;
}

export interface PerfScanSuspect {
  nodeId: string;
  nodeName: string;
  path: string;
  fpsGain: number;
  depth: number;
}

export interface PerfScanProgress {
  phase: 'baseline' | 'scanning' | 'done' | 'error';
  message: string;
  testsDone: number;
  testsBudget: number;
  currentPath?: string;
}

export interface PerfScanReport {
  baselineFps: number;
  suspects: PerfScanSuspect[];
  /** nodeId → 关该子树时的 FPS 增益（取各次测量最大值） */
  gainByNodeId: Map<string, number>;
  testsDone: number;
  durationMs: number;
}

const MODE_PRESETS: Record<PerfScanMode, PerfScanConfig> = {
  quick: {
    minFpsGain: 2,
    minRelativeGain: 0.15,
    maxDepth: 4,
    maxTests: 20,
    smallFanout: 5,
    sampleMs: 600,
    stabilizeMs: 150,
    sampleRounds: 2,
    topK: 1,
  },
  standard: {
    minFpsGain: 1,
    minRelativeGain: 0.15,
    maxDepth: 8,
    maxTests: 40,
    smallFanout: 5,
    sampleMs: 800,
    stabilizeMs: 200,
    sampleRounds: 3,
    topK: 1,
  },
  fine: {
    minFpsGain: 0.5,
    minRelativeGain: 0.1,
    maxDepth: 12,
    maxTests: 80,
    smallFanout: 8,
    sampleMs: 1000,
    stabilizeMs: 250,
    sampleRounds: 3,
    topK: 2,
  },
};

export const getPerfScanConfig = (mode: PerfScanMode): PerfScanConfig => ({
  ...MODE_PRESETS[mode],
});

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** 快照场景内所有节点 active */
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

/** 从快照恢复 active */
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

/** 采样当前窗口 FPS（rAF 计数） */
export const measureFps = async (sampleMs: number): Promise<number> => {
  return new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = (): void => {
      frames += 1;
      if (performance.now() - start >= sampleMs) {
        const elapsed = (performance.now() - start) / 1000;
        resolve(elapsed > 0 ? frames / elapsed : 0);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
};

const measureFpsMedian = async (
  sampleMs: number,
  rounds: number
): Promise<number> => {
  const samples: number[] = [];
  for (let i = 0; i < rounds; i += 1) {
    samples.push(await measureFps(sampleMs));
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0;
};

const getActiveChildren = (node: cc.Node): cc.Node[] =>
  [...(node.children ?? [])].filter((c) => c && c.active !== false);

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

  const snapshot = snapshotActiveStates(scene);
  const gainByNodeId = new Map<string, number>();
  const suspects: PerfScanSuspect[] = [];
  let testsDone = 0;
  const startedAt = performance.now();

  const recordGain = (node: cc.Node, gain: number, depth: number): void => {
    const nodeId = getNodeId(node);
    const prev = gainByNodeId.get(nodeId) ?? 0;
    if (gain > prev) {
      gainByNodeId.set(nodeId, gain);
    }
    if (gain >= config.minFpsGain) {
      suspects.push({
        nodeId,
        nodeName: node.name || '(unnamed)',
        path: buildNodePath(scene, nodeId),
        fpsGain: gain,
        depth,
      });
    }
  };

  try {
    onProgress({
      phase: 'baseline',
      message: '采集基准 FPS…',
      testsDone: 0,
      testsBudget: config.maxTests,
    });

    const baselineFps = await measureFpsMedian(
      config.sampleMs,
      config.sampleRounds
    );

    if (shouldCancel()) return null;

    const measureDisabledGain = async (
      target: cc.Node
    ): Promise<number> => {
      restoreActiveStates(scene, snapshot);
      target.active = false;
      await sleep(config.stabilizeMs);
      const fps = await measureFpsMedian(config.sampleMs, config.sampleRounds);
      restoreActiveStates(scene, snapshot);
      return fps - baselineFps;
    };

    const scanParent = async (
      parent: cc.Node,
      depth: number,
      parentGain: number | null
    ): Promise<void> => {
      if (shouldCancel()) return;
      if (depth >= config.maxDepth || testsDone >= config.maxTests) return;

      const children = getActiveChildren(parent);
      if (children.length === 0) return;

      const childResults: Array<{ child: cc.Node; gain: number }> = [];

      for (const child of children) {
        if (shouldCancel()) return;
        if (testsDone >= config.maxTests) break;

        const nodeId = getNodeId(child);
        const nodeName = child.name || '(unnamed)';
        const path = buildNodePath(scene, nodeId);

        onProgress({
          phase: 'scanning',
          message: `测试 ${path}`,
          testsDone,
          testsBudget: config.maxTests,
          currentPath: path,
        });

        const gain = await measureDisabledGain(child);
        testsDone += 1;
        recordGain(child, gain, depth);
        childResults.push({ child, gain });

        console.log(
          `[性能扫描] ${nodeName}(${nodeId}) 关子树增益 +${gain.toFixed(1)}fps`
        );
      }

      childResults.sort((a, b) => b.gain - a.gain);
      const levelBest = childResults[0]?.gain ?? 0;

      let winners = childResults.filter((r) => r.gain >= config.minFpsGain);
      if (parentGain !== null && parentGain > 0) {
        winners = winners.filter(
          (r) => r.gain >= parentGain * config.minRelativeGain
        );
      } else if (levelBest > 0) {
        winners = winners.filter(
          (r) => r.gain >= levelBest * config.minRelativeGain
        );
      }

      const topK =
        children.length <= config.smallFanout
          ? winners.slice(0, config.topK)
          : winners.slice(0, config.topK);

      for (const { child, gain } of topK) {
        await scanParent(child, depth + 1, gain);
      }
    };

    onProgress({
      phase: 'scanning',
      message: '扫描顶层子节点…',
      testsDone: 0,
      testsBudget: config.maxTests,
    });

    await scanParent(scene, 0, null);

    restoreActiveStates(scene, snapshot);

    suspects.sort((a, b) => b.fpsGain - a.fpsGain);
    const deduped = suspects.filter(
      (s, i, arr) => arr.findIndex((x) => x.nodeId === s.nodeId) === i
    );

    const report: PerfScanReport = {
      baselineFps,
      suspects: deduped,
      gainByNodeId,
      testsDone,
      durationMs: performance.now() - startedAt,
    };

    const top = deduped[0];
    onProgress({
      phase: 'done',
      message: top
        ? `完成 · 基准 ${baselineFps.toFixed(0)}fps · Top: ${top.nodeName} +${top.fpsGain.toFixed(1)}fps`
        : `完成 · 基准 ${baselineFps.toFixed(0)}fps · 未发现明显热点`,
      testsDone,
      testsBudget: config.maxTests,
      currentPath: top?.path,
    });

    return report;
  } catch (error) {
    restoreActiveStates(scene, snapshot);
    console.error('[性能扫描] 扫描失败', error);
    onProgress({
      phase: 'error',
      message: error instanceof Error ? error.message : '扫描失败',
      testsDone,
      testsBudget: config.maxTests,
    });
    return null;
  }
};

/** 扫描结束后展开嫌疑路径上的祖先 */
export const expandSuspectPaths = (
  scene: cc.Node,
  gainByNodeId: Map<string, number>,
  expanded: Set<string>,
  minGain: number
): void => {
  for (const [nodeId, gain] of gainByNodeId) {
    if (gain < minGain) continue;
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
