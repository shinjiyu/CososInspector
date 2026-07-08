#!/usr/bin/env node
/**
 * 常驻 MCP 桥接。多实例 registry 主键 = 试玩 URL 域名。
 *
 *   npm run cocos-bridge -- --domain play.godeebxp.com --page-url-match godeebxp
 */
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  normalizeDomain,
  removeRegistryInstance,
  upsertRegistryInstance,
} from './bridge-registry.mjs';
import { setDaemonMeta, startBridge, stopBridgeServer } from './bridge-server.mjs';
import { startShareHttp } from './share-http.mjs';
import { getShareHttpPort, setShareContext } from './shared-fs.mjs';

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'));

const parseArgs = (argv) => {
  const get = (flag, envKey, fallback) => {
    const i = argv.indexOf(flag);
    if (i >= 0 && argv[i + 1]) return argv[i + 1];
    if (envKey && process.env[envKey]) return process.env[envKey];
    return fallback;
  };
  return {
    domain: get('--domain', 'COCOS_INSPECTOR_DOMAIN', ''),
    pageUrlMatch: get('--page-url-match', 'COCOS_PAGE_URL_MATCH', ''),
    wsPort: Number(get('--ws-port', 'COCOS_BRIDGE_PORT', '17373')),
  };
};

const args = parseArgs(process.argv.slice(2));
const domain = normalizeDomain(args.domain);
const pageUrlMatch = args.pageUrlMatch || (domain ? domain.split('.')[0] : '');
const shareDir = domain
  ? join(repoRoot, 'tmp', 'mcp-share', domain.replace(/\./g, '_'))
  : join(repoRoot, 'tmp', 'mcp-share');

setShareContext({ shareDir, domain, wsPort: args.wsPort });

const httpPortPreferred = getShareHttpPort();

const wsPort = await startBridge(args.wsPort, {
  domain: domain || undefined,
  pageUrlMatch,
  wsPort: args.wsPort,
  httpPort: httpPortPreferred,
  shareDir,
});

setShareContext({ shareDir, domain, wsPort });

let httpPort = httpPortPreferred;
try {
  httpPort = await startShareHttp(httpPortPreferred);
} catch (e) {
  if (e?.code === 'EADDRINUSE') {
    httpPort = await startShareHttp(0);
  } else {
    throw e;
  }
}

setDaemonMeta({
  domain: domain || undefined,
  pageUrlMatch,
  wsPort,
  httpPort,
  shareDir,
});
setShareContext({ shareDir, domain, wsPort, httpPort });

if (domain) {
  upsertRegistryInstance({
    domain,
    wsPort,
    httpPort,
    pageUrlMatch,
    shareDir,
    pid: process.pid,
    extensionConnected: false,
  });
}

console.error('[cocos-inspector] 本地服务已启动');
console.error(`  域名       ${domain || '(待扩展上报)'}`);
console.error(`  WebSocket  ws://127.0.0.1:${wsPort}`);
console.error(`  HTTP       http://127.0.0.1:${httpPort}`);
console.error(`  共享目录   ${shareDir}`);
console.error('[cocos-inspector] 请保持本进程运行；试玩页 F5 后 MCP 应显示已连接。');

const shutdown = () => {
  if (domain) removeRegistryInstance(domain);
  stopBridgeServer();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.stdin.resume();
