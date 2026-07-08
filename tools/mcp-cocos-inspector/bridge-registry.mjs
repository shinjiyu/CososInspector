import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REGISTRY_VERSION = 1;
const SERVICE_NAME = 'cocos-inspector';

export function bridgeRegistryHome() {
  if (process.env.COCOS_INSPECTOR_REGISTRY_HOME) {
    return path.resolve(process.env.COCOS_INSPECTOR_REGISTRY_HOME);
  }
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'cocos-inspector');
  }
  return path.join(os.homedir(), '.cocos-inspector');
}

export function bridgeRegistryPath() {
  return path.join(bridgeRegistryHome(), 'instances.json');
}

/** 从 URL / 域名 / pageUrlMatch 提取 registry 主键（hostname） */
export function normalizeDomain(input) {
  if (!input || typeof input !== 'string') return '';
  let s = input.trim().toLowerCase();
  if (!s) return '';
  try {
    if (s.includes('://')) {
      return new URL(s).hostname.replace(/^www\./, '');
    }
    if (s.includes('/')) {
      return new URL(`https://${s}`).hostname.replace(/^www\./, '');
    }
    if (s.includes('.')) {
      return s.replace(/^www\./, '').split('/')[0].split(':')[0];
    }
  } catch {
    /* fallthrough */
  }
  return '';
}

export function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function ensureRegistryDir() {
  fs.mkdirSync(bridgeRegistryHome(), { recursive: true });
}

export function readRegistry() {
  const file = bridgeRegistryPath();
  if (!fs.existsSync(file)) {
    return { version: REGISTRY_VERSION, instances: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      version: raw.version ?? REGISTRY_VERSION,
      instances:
        raw.instances && typeof raw.instances === 'object' ? raw.instances : {},
    };
  } catch {
    return { version: REGISTRY_VERSION, instances: {}, error: 'invalid instances.json' };
  }
}

function writeRegistry(data) {
  ensureRegistryDir();
  const file = bridgeRegistryPath();
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(
    tmp,
    `${JSON.stringify({ version: REGISTRY_VERSION, instances: data.instances ?? {} }, null, 2)}\n`,
    'utf8'
  );
  fs.renameSync(tmp, file);
}

export function upsertRegistryInstance(entry) {
  const domain = normalizeDomain(entry.domain);
  if (!domain) {
    throw new Error('domain required for bridge registry');
  }
  const registry = readRegistry();
  registry.instances[domain] = {
    domain,
    label: entry.label ?? domain,
    wsPort: entry.wsPort,
    httpPort: entry.httpPort,
    pageUrlMatch: entry.pageUrlMatch ?? domain.split('.')[0] ?? domain,
    shareDir: entry.shareDir ?? '',
    pid: entry.pid ?? process.pid,
    service: SERVICE_NAME,
    extensionConnected: entry.extensionConnected ?? false,
    updatedAt: new Date().toISOString(),
  };
  writeRegistry(registry);
  return registry.instances[domain];
}

export function patchRegistryInstance(domain, patch) {
  const key = normalizeDomain(domain);
  if (!key) return null;
  const registry = readRegistry();
  const cur = registry.instances[key];
  if (!cur) return null;
  registry.instances[key] = {
    ...cur,
    ...patch,
    domain: key,
    updatedAt: new Date().toISOString(),
  };
  writeRegistry(registry);
  return registry.instances[key];
}

export function removeRegistryInstance(domain) {
  const key = normalizeDomain(domain);
  if (!key) return { removed: false };
  const registry = readRegistry();
  if (!registry.instances[key]) return { removed: false, key };
  delete registry.instances[key];
  writeRegistry(registry);
  return { removed: true, key };
}

export function findRegistryByDomain(domain) {
  const key = normalizeDomain(domain);
  if (!key) return null;
  const entry = readRegistry().instances[key];
  return entry ? { key, ...entry } : null;
}

export function listRegistryInstances() {
  return Object.entries(readRegistry().instances).map(([key, entry]) => ({
    key,
    ...entry,
  }));
}

export function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
