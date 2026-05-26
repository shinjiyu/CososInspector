#!/usr/bin/env node
/**
 * 常驻 MCP 桥接（请保持运行）。Cursor MCP 以客户端连接，避免随 MCP 进程退出而断开。
 *
 *   npm run cocos-bridge
 *   或: node tools/mcp-cocos-inspector/bridge-daemon.mjs
 */

import { startBridge } from './bridge-server.mjs';
import { startShareHttp } from './share-http.mjs';
import { getShareDir, getShareHttpPort } from './shared-fs.mjs';

const port = Number(process.env.COCOS_BRIDGE_PORT ?? 17373);
const httpPort = getShareHttpPort();

await startBridge(port);
await startShareHttp(httpPort);
console.error(`[cocos-inspector] 本地服务已启动`);
console.error(`  WebSocket  ws://127.0.0.1:${port}   （扩展 / MCP 连接）`);
console.error(`  HTTP       http://127.0.0.1:${httpPort}  （文件 + API）`);
console.error(`  导出+打包   POST http://127.0.0.1:${httpPort}/api/export-pack  （默认含重打包）`);
console.error(`  状态       GET  http://127.0.0.1:${httpPort}/api/status`);
console.error(`  共享目录   ${getShareDir()}`);
console.error('[cocos-inspector] 请保持本进程运行；试玩页扩展连 WS，导出由 HTTP 在本地执行。');

process.stdin.resume();
