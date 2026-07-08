export type AssetLoadState = 'loaded' | 'loading' | 'failed' | 'unknown';

export interface AssetRecord {
  uuid: string;
  name: string;
  type: string;
  refCount: number;
  state: AssetLoadState;
  bundle: string;
  nativeUrl: string;
}

export interface BundleRecord {
  name: string;
  base: string;
  deps: string[];
  assetCount: number;
}

export interface AssetInventorySummary {
  assetCount: number;
  bundleCount: number;
  loadedCount: number;
  loadingCount: number;
  pipelineTasks: number;
  downloaderConcurrency: number;
}

export interface AssetInventory {
  summary: AssetInventorySummary;
  assets: AssetRecord[];
  bundles: BundleRecord[];
}

const assetState = (asset: Record<string, unknown>): AssetLoadState => {
  if (asset.loaded === true) return 'loaded';
  if (asset._loading === true || asset.loading === true) return 'loading';
  if (asset._loadError || asset.loadError) return 'failed';
  return 'unknown';
};

const assetTypeName = (asset: Record<string, unknown>): string => {
  const cls =
    (asset.__classname__ as string | undefined) ??
    (asset.constructor as { name?: string } | undefined)?.name ??
    'Asset';
  return cls.replace(/^cc\./, '');
};

const forEachAssetMap = (
  assets: unknown,
  fn: (uuid: string, asset: Record<string, unknown>) => void
): void => {
  if (!assets || typeof assets !== 'object') return;
  const rec = assets as {
    forEach?: (cb: (asset: unknown, uuid: string) => void) => void;
    _map?: Map<string, unknown>;
  };
  if (typeof rec.forEach === 'function') {
    rec.forEach((asset, uuid) => fn(uuid, asset as Record<string, unknown>));
    return;
  }
  if (rec._map instanceof Map) {
    rec._map.forEach((asset, uuid) =>
      fn(uuid, asset as Record<string, unknown>)
    );
  }
};

const findBundleForUuid = (
  bundles: Map<string, Record<string, unknown>>,
  uuid: string
): string => {
  for (const [name, bundle] of bundles) {
    const config = bundle._config as { uuids?: string[]; paths?: Record<string, unknown> } | undefined;
    if (config?.uuids?.includes(uuid)) return name;
    if (config?.paths && Object.values(config.paths).some((p) => {
      const entry = p as { uuid?: string };
      return entry?.uuid === uuid;
    })) {
      return name;
    }
  }
  return '';
};

export const collectAssetInventory = (): AssetInventory | null => {
  try {
    const ccg = window.cc as Record<string, unknown>;
    const am = ccg.assetManager as Record<string, unknown> | undefined;
    if (!am) return null;

    const bundleMap = new Map<string, Record<string, unknown>>();
    const bundlesRaw = am.bundles as
      | { forEach?: (cb: (b: unknown, name: string) => void) => void; _map?: Map<string, unknown> }
      | undefined;

    if (bundlesRaw?.forEach) {
      bundlesRaw.forEach((b, name) =>
        bundleMap.set(name, b as Record<string, unknown>)
      );
    } else if (bundlesRaw?._map) {
      bundlesRaw._map.forEach((b, name) =>
        bundleMap.set(name, b as Record<string, unknown>)
      );
    }

    const assets: AssetRecord[] = [];
    let loadedCount = 0;
    let loadingCount = 0;

    forEachAssetMap(am.assets, (uuid, asset) => {
      const state = assetState(asset);
      if (state === 'loaded') loadedCount += 1;
      if (state === 'loading') loadingCount += 1;
      assets.push({
        uuid,
        name: String(asset.name ?? uuid.slice(0, 8)),
        type: assetTypeName(asset),
        refCount: Number(asset.refCount ?? 0),
        state,
        bundle: findBundleForUuid(bundleMap, uuid),
        nativeUrl: String(asset.nativeUrl ?? asset._nativeUrl ?? ''),
      });
    });

    assets.sort((a, b) => {
      if (b.refCount !== a.refCount) return b.refCount - a.refCount;
      return a.name.localeCompare(b.name);
    });

    const bundles: BundleRecord[] = [];
    bundleMap.forEach((bundle, name) => {
      const deps = bundle.deps as Set<string> | string[] | undefined;
      const depList = deps
        ? deps instanceof Set
          ? [...deps]
          : [...deps]
        : [];
      const config = bundle._config as { assetInfos?: { count?: number } } | undefined;
      bundles.push({
        name,
        base: String(bundle.base ?? ''),
        deps: depList,
        assetCount: config?.assetInfos?.count ?? 0,
      });
    });
    bundles.sort((a, b) => a.name.localeCompare(b.name));

    const pipeline = am.pipeline as { taskNum?: number } | undefined;
    const downloader = am.downloader as { maxConcurrency?: number } | undefined;

    return {
      summary: {
        assetCount: assets.length,
        bundleCount: bundles.length,
        loadedCount,
        loadingCount,
        pipelineTasks: pipeline?.taskNum ?? 0,
        downloaderConcurrency: downloader?.maxConcurrency ?? 0,
      },
      assets,
      bundles,
    };
  } catch (error) {
    console.error('[资源面板] collectAssetInventory 失败', error);
    return null;
  }
};
