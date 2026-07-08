import {
  domainFromUrl,
  findRegistryByDomain,
  bridgeRegistryPath,
  isPidAlive,
  listRegistryInstances,
  normalizeDomain,
  readRegistry,
} from './bridge-registry.mjs';

const HEALTH_TIMEOUT_MS = 2500;

export async function probeInstanceHealth(entry) {
  const httpPort = entry.httpPort ?? entry.wsPort + 1;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`http://127.0.0.1:${httpPort}/api/status`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ...entry,
        online: false,
        daemonAlive: isPidAlive(entry.pid),
        extensionConnected: false,
        probeError: `HTTP ${res.status}`,
      };
    }
    const body = await res.json();
    return {
      ...entry,
      online: true,
      daemonAlive: true,
      extensionConnected: !!body.extensionConnected,
      tabs: body.tabs ?? [],
      shareDir: body.shareDir ?? entry.shareDir,
      wsPort: body.wsPort ?? entry.wsPort,
      httpPort: body.httpPort ?? httpPort,
      domain: body.domain ?? entry.domain,
    };
  } catch (e) {
    return {
      ...entry,
      online: false,
      daemonAlive: isPidAlive(entry.pid),
      extensionConnected: false,
      probeError: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function listBridgesWithHealth() {
  const items = listRegistryInstances();
  const probed = await Promise.all(items.map((e) => probeInstanceHealth(e)));
  return {
    registryPath: bridgeRegistryPath(),
    instances: probed,
    onlineCount: probed.filter((i) => i.online && i.extensionConnected).length,
  };
}

function matchDomain(candidate, entry) {
  const d = normalizeDomain(candidate);
  if (!d) return false;
  if (entry.domain === d) return true;
  if (entry.pageUrlMatch && d.includes(entry.pageUrlMatch)) return true;
  if (entry.domain && d.includes(entry.domain)) return true;
  return false;
}

function pickOnlineInstances(instances) {
  return instances.filter((i) => i.online && i.extensionConnected);
}

/**
 * 解析 MCP 目标实例。
 * 优先级：domain > pageUrlMatch(转域名或匹配 registry) > env > 唯一在线实例 > 唯一 registry 项
 */
export async function resolveBridgeTarget(opts = {}) {
  const envDomain = normalizeDomain(process.env.COCOS_INSPECTOR_DOMAIN ?? '');
  const envMatch = process.env.COCOS_PAGE_URL_MATCH ?? '';
  const envWsPort = Number(process.env.COCOS_BRIDGE_PORT ?? 0) || undefined;

  const listed = await listBridgesWithHealth();

  if (opts.wsPort) {
    const hit = listed.instances.find((i) => Number(i.wsPort) === Number(opts.wsPort));
    if (hit) {
      return {
        ...hit,
        pageUrlMatch: opts.pageUrlMatch ?? hit.pageUrlMatch ?? envMatch,
        resolvedBy: 'wsPort',
      };
    }
  }

  const domainHint = normalizeDomain(opts.domain ?? '') || normalizeDomain(opts.pageUrlMatch ?? '');
  if (domainHint) {
    const direct = listed.instances.find((i) => i.domain === domainHint);
    if (direct) {
      return {
        ...direct,
        pageUrlMatch: opts.pageUrlMatch ?? direct.pageUrlMatch ?? envMatch,
        resolvedBy: 'domain',
      };
    }
    const fuzzy = listed.instances.find((i) => matchDomain(domainHint, i));
    if (fuzzy) {
      return {
        ...fuzzy,
        pageUrlMatch: opts.pageUrlMatch ?? fuzzy.pageUrlMatch ?? envMatch,
        resolvedBy: 'domain-fuzzy',
      };
    }
    const reg = findRegistryByDomain(domainHint);
    if (reg) {
      return {
        ...reg,
        pageUrlMatch: opts.pageUrlMatch ?? reg.pageUrlMatch ?? envMatch,
        resolvedBy: 'registry-offline',
      };
    }
  }

  if (opts.pageUrlMatch) {
    const m = String(opts.pageUrlMatch).toLowerCase();
    const byMatch = listed.instances.find(
      (i) =>
        String(i.pageUrlMatch ?? '').toLowerCase() === m ||
        String(i.domain ?? '').includes(m)
    );
    if (byMatch) {
      return { ...byMatch, pageUrlMatch: opts.pageUrlMatch, resolvedBy: 'pageUrlMatch' };
    }
    for (const tab of listed.instances.flatMap((i) => i.tabs ?? [])) {
      const host = domainFromUrl(tab.url ?? '');
      if (host.includes(m)) {
        const inst = listed.instances.find((i) => i.domain === host);
        if (inst) {
          return { ...inst, pageUrlMatch: opts.pageUrlMatch, resolvedBy: 'tab-url' };
        }
      }
    }
  }

  if (envDomain) {
    const hit = listed.instances.find((i) => i.domain === envDomain);
    if (hit) {
      return {
        ...hit,
        pageUrlMatch: opts.pageUrlMatch ?? hit.pageUrlMatch ?? envMatch,
        resolvedBy: 'env-domain',
      };
    }
  }

  const online = pickOnlineInstances(listed.instances);
  if (online.length === 1) {
    return {
      ...online[0],
      pageUrlMatch: opts.pageUrlMatch ?? online[0].pageUrlMatch ?? envMatch,
      resolvedBy: 'sole-online',
    };
  }

  if (envWsPort) {
    return {
      domain: envDomain || undefined,
      wsPort: envWsPort,
      httpPort: Number(process.env.COCOS_SHARE_HTTP_PORT ?? envWsPort + 1),
      pageUrlMatch: opts.pageUrlMatch ?? envMatch,
      resolvedBy: 'env-wsPort',
      online: online.some((i) => i.wsPort === envWsPort),
      extensionConnected: online.some((i) => i.wsPort === envWsPort),
    };
  }

  if (listed.instances.length === 1) {
    const only = listed.instances[0];
    return {
      ...only,
      pageUrlMatch: opts.pageUrlMatch ?? only.pageUrlMatch ?? envMatch,
      resolvedBy: 'sole-registry',
    };
  }

  if (online.length > 1) {
    const domains = online.map((i) => i.domain).join(', ');
    throw new Error(
      `多个 Inspector 实例在线 (${domains})，请指定 domain 或 pageUrlMatch，或调用 cocos_inspector_list_bridges`
    );
  }

  throw new Error(
    '未找到可用的 Inspector 桥接。请先 npm run cocos-bridge -- --domain play.example.com'
  );
}
