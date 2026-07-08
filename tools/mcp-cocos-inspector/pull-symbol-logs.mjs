#!/usr/bin/env node
import { callBridgeAtPort } from './bridge-server.mjs';

const wsPort = Number(process.argv[2] ?? 17373);
const frameName = process.argv[3] ?? 'symbol_04';
const opts = { pageUrlMatch: 'godeebxp' };

const sprites = await callBridgeAtPort(wsPort, 'listSprites', [], opts);
const hits = sprites
  .filter((s) => s.frameName === frameName)
  .map((s) => ({
    nodeId: s.id || s.nodeId,
    nodeName: s.name,
    path: s.path,
    active: s.active,
  }));
console.log('listSprites hits', hits.length, frameName);
for (const h of hits.slice(0, 3)) {
  console.log(' ', h.nodeName, h.nodeId, h.path, 'active=', h.active);
}
for (const h of hits.slice(0, 5)) {
  const nodeId = h.nodeId;
  console.log('\n--- detail', h.nodeName, nodeId, h.path);
  const detail = await callBridgeAtPort(wsPort, 'getSpriteDetail', [nodeId], opts);
  if (detail.ok) {
    const d = detail.detail;
    console.log(
      'method:',
      d.extractMethod,
      'frameRect:',
      JSON.stringify(d.frameRect),
      'originalSize:',
      JSON.stringify(d.originalSize),
      'display:',
      JSON.stringify(d.displaySize),
      'rotated:',
      d.isRotated
    );
  } else {
    console.log('err:', detail.error);
  }
}

const logs = await callBridgeAtPort(
  wsPort,
  'getTextureExtractLogs',
  [{ limit: 300 }],
  opts
);
const related = (logs.logs || []).filter(
  (r) =>
    r.frameName === frameName ||
    hits.some((h) => h.nodeId === r.nodeUUID || h.nodeName === r.nodeName)
);
console.log('\n=== LOGS for', frameName, related.length, '===');
for (const row of related) {
  const fr = row.frameRect
    ? `rect(${row.frameRect.x},${row.frameRect.y},${row.frameRect.w}x${row.frameRect.h})`
    : '';
  const ps = row.pixelSize ? `${row.pixelSize.w}x${row.pixelSize.h}` : '';
  const detail = row.detail ? JSON.stringify(row.detail) : '';
  console.log(
    new Date(row.ts).toISOString(),
    row.method || '-',
    row.message,
    fr,
    ps,
    row.cacheHit ? 'CACHE' : '',
    detail
  );
}
