#!/usr/bin/env node
import { callBridgeAtPort } from './bridge-server.mjs';

const wsPort = Number(process.argv[2] ?? 17373);
const opts = { pageUrlMatch: 'godeebxp' };

const probe = await callBridgeAtPort(
  wsPort,
  'evalPage',
  [
    `(function(){
      const api = window.__cocosInspectorApi;
      const raw = localStorage.getItem('cocos-inspector-texture-logs');
      let ls = [];
      try { ls = raw ? JSON.parse(raw) : []; } catch {}
      return {
        hasApi: !!api,
        hasLogFn: !!(api && api.getTextureExtractLogs),
        version: api ? api.version : null,
        lsCount: Array.isArray(ls) ? ls.length : -1,
        lsTail: Array.isArray(ls) ? ls.slice(-2) : [],
      };
    })()`,
  ],
  opts
);
console.log('probe:', JSON.stringify(probe, null, 2));

const frameFilter = process.argv[3] ?? '';
const sprites = await callBridgeAtPort(wsPort, 'listSprites', [], opts);
const targets = frameFilter
  ? sprites.filter((s) => (s.frameName || '').includes(frameFilter))
  : sprites.filter((s) =>
      /symbol/i.test(s.frameName || s.searchText || s.name || '')
    );
console.log('targets:', targets.length, frameFilter ? `frame~${frameFilter}` : 'symbol*');

for (const s of targets.slice(0, 15)) {
  const nodeId = s.id || s.nodeId;
  console.log('---', s.name, s.frameName, nodeId);
  const detail = await callBridgeAtPort(wsPort, 'getSpriteDetail', [nodeId], opts);
  if (detail.ok) {
    const d = detail.detail;
    console.log(
      '  method:',
      d.extractMethod,
      'frameRect:',
      JSON.stringify(d.frameRect),
      'display:',
      JSON.stringify(d.displaySize)
    );
  } else {
    console.log('  err:', detail.error);
  }
}

const logs = await callBridgeAtPort(
  wsPort,
  'getTextureExtractLogs',
  [{ limit: 200 }],
  opts
);
console.log('\n=== LOGS', logs.count, '===');
for (const row of logs.logs || []) {
  const fr = row.frameRect
    ? `rect(${row.frameRect.x},${row.frameRect.y},${row.frameRect.w}x${row.frameRect.h})`
    : '';
  const ps = row.pixelSize ? `${row.pixelSize.w}x${row.pixelSize.h}` : '';
  console.log(
    new Date(row.ts).toISOString(),
    row.nodeName,
    row.nodeUUID,
    row.method || '-',
    row.message,
    fr,
    ps,
    row.cacheHit ? 'CACHE' : ''
  );
}
