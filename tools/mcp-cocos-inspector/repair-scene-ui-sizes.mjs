#!/usr/bin/env node
/**
 * 从快照解析 UITransform 尺寸，写入 .scene 磁盘（set-property 未落盘时的补救）
 */
import fs from 'fs';
import path from 'path';
import { buildPathToNodeUuidMap, patchUiSizesOnDisk } from './scene-patch-disk.mjs';
import { collectUiSizeBindings } from './scene-snapshot-parse.mjs';

const PROJECT = process.env.COCOS_PROJECT ?? 'D:/workspace/testAutoCopy';
const SCENE_REL = 'assets/scene/godeebxp_recovered.scene';
const SNAPSHOT = process.argv[2] ?? 'tmp/godeebxp-scene-snapshot.json';

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const sceneAbs = path.join(PROJECT, SCENE_REL);
const pathMap = buildPathToNodeUuidMap(sceneAbs);
const bindings = collectUiSizeBindings(snapshot.root, pathMap);

console.error(`[repair-ui] 补丁 ${bindings.length} 个 UITransform 尺寸`);
const uiPatch = patchUiSizesOnDisk(sceneAbs, bindings);

const scene = JSON.parse(fs.readFileSync(sceneAbs, 'utf8'));
let default100 = 0;
let sized = 0;
let zeroSized = 0;
for (const o of scene) {
  if (o.__type__ !== 'cc.UITransform') continue;
  const w = o._contentSize?.width ?? 0;
  const h = o._contentSize?.height ?? 0;
  if (w === 100 && h === 100) default100 += 1;
  else if (w === 0 && h === 0) zeroSized += 1;
  else sized += 1;
}

console.log(
  JSON.stringify({ ok: true, bindings: bindings.length, uiPatch, default100, sized, zeroSized }, null, 2)
);
