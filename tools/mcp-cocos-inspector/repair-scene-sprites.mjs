#!/usr/bin/env node
/**
 * 修复 godeebxp_recovered：SpriteFrame 磁盘落盘 + UICamera/Canvas 相机
 */
import fs from 'fs';
import path from 'path';
import {
  buildPathToNodeUuidMap,
  patchCanvasCameraOnDisk,
  patchSpriteFramesOnDisk,
  patchUiSizesOnDisk,
} from './scene-patch-disk.mjs';

const BRIDGE = process.env.COCOSMCP_BRIDGE ?? 'http://127.0.0.1:3921';
const PROJECT = process.env.COCOS_PROJECT ?? 'D:/workspace/testAutoCopy';
const SCENE_REL = 'assets/scene/godeebxp_recovered.scene';
const MANIFEST = process.argv[2] ?? 'tmp/godeebxp-texture-manifest.json';

const execEval = async (code) => {
  const res = await fetch(`${BRIDGE}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'eval', code }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(JSON.stringify(body));
  return body.result;
};

const sfUuidFromMeta = (rel) => {
  const metaPath = path.join(PROJECT, `${rel}.meta`);
  if (!fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return meta.subMetas?.f9941?.uuid ?? null;
};

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).manifest;
const sceneAbs = path.join(PROJECT, SCENE_REL);
const sceneUrl = `db://${SCENE_REL.replace(/\\/g, '/')}`;

const pathMap = buildPathToNodeUuidMap(sceneAbs);
const rootName = [...pathMap.keys()][0]?.split(' › ')[0] ?? 'godeebxp_recovered';

const bindings = [];
for (const [nodeId, entry] of Object.entries(manifest)) {
  const sfUuid = sfUuidFromMeta(entry.rel);
  if (!sfUuid) continue;

  const candidates = [
    entry.nodePath?.replace(/^main › /, ''),
    entry.nodePath,
  ];
  let nodeUuid = null;
  for (const k of candidates) {
    if (k && pathMap.has(k)) {
      nodeUuid = pathMap.get(k);
      break;
    }
  }
  if (!nodeUuid) continue;
  bindings.push({ nodeId, nodeUuid, sfUuid, path: entry.nodePath });
}

console.error(`[repair] 磁盘补丁 ${bindings.length} 个 SpriteFrame`);

const sfPatch = patchSpriteFramesOnDisk(sceneAbs, bindings);
const camPatch = patchCanvasCameraOnDisk(sceneAbs, 720);

console.error('[repair] 请关闭场景(不保存)后重新打开');

const text = fs.readFileSync(sceneAbs, 'utf8');
const nonNullSf = (text.match(/"_spriteFrame": \{/g) ?? []).length;
console.log(
  JSON.stringify(
    { ok: true, bindings: bindings.length, spritePatched: sfPatch.patched, nonNullSf, camPatch },
    null,
    2
  )
);
