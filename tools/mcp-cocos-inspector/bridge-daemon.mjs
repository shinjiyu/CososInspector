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
console.error(`[cocos-inspector] 桥接 ws://127.0.0.1:${port}`);
console.error(`[cocos-inspector] 共享目录 ${getShareDir()}`);
console.error(`[cocos-inspector] 文件 HTTP http://127.0.0.1:${httpPort}/in|out/...`);
console.error('[cocos-inspector] 请保持本进程运行；Cursor 中启用 cocos-inspector MCP。');

process.stdin.resume();
