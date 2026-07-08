#!/usr/bin/env node
/**
 * 单节点 Sprite 恢复测试（不重建全场景）
 *
 * 用法:
 *   node tools/mcp-cocos-inspector/test-single-sprite.mjs Node.3467 \
 *     --project D:/workspace/testAutoCopy \
 *     --scene assets/scene/godeebxp_recovered.scene \
 *     --node-path "SymbolView/0/symbolSprite"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  callBridgeAtPort,
  connectBridgeClientOnly,
  waitForExtension,
} from './bridge-server.mjs';
import { resetSpriteMetaTrimOnDisk } from './scene-patch-disk.mjs';
import { resolveSharePath } from './shared-fs.mjs';

const trimPlace = (originalSize, frameSize, offset) => ({
  x: Math.round((originalSize.w - frameSize.w) / 2 + offset.x),
  y: Math.round((originalSize.h - frameSize.h) / 2 - offset.y),
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const nodeId = argv.find((a) => !a.startsWith('--'));
  const get = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    nodeId,
    project: get('--project', 'D:/workspace/testAutoCopy'),
    sceneRel: get('--scene', 'assets/scene/godeebxp_recovered.scene'),
    nodePath: get('--node-path', 'SymbolView/0/symbolSprite'),
    wsPort: Number(get('--ws-port', '17373')),
    pageUrlMatch: get('--page-url-match', 'godeebxp'),
    bridge: get('--bridge', 'http://127.0.0.1:3921'),
  };
};

const normalizeProjectKey = (p) => path.resolve(p).replace(/\\/g, '/').toLowerCase();

const resolveCreatorBridge = (project, bridgeArg) => {
  const localApp = process.env.LOCALAPPDATA ?? '';
  const registryPath = path.join(localApp, 'cocos-meta-mcp', 'instances.json');
  const key = normalizeProjectKey(project);
  if (fs.existsSync(registryPath)) {
    const inst = JSON.parse(fs.readFileSync(registryPath, 'utf8')).instances?.[key];
    if (inst?.port) return `http://127.0.0.1:${inst.port}`;
  }
  return bridgeArg;
};

const execEval = async (bridge, code, timeoutMs = 120_000) => {
  const res = await fetch(`${bridge}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'eval', code }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json();
  if (!res.ok || body.ok === false) throw new Error(JSON.stringify(body));
  return body.result;
};

const main = async () => {
  const args = parseArgs();
  if (!args.nodeId) {
    console.error(
      '用法: node test-single-sprite.mjs <NodeId> [--project PATH] [--node-path SymbolView/0/symbolSprite]'
    );
    process.exit(1);
  }

  args.bridge = resolveCreatorBridge(args.project, args.bridge);
  console.error(`[test-single] Inspector WS + Creator ${args.bridge}`);
  await connectBridgeClientOnly(args.wsPort);
  await waitForExtension(60_000, args.wsPort);

  let nodeId = args.nodeId;
  if (nodeId === 'auto' || nodeId === 'symbol') {
    const sprites = await callBridgeAtPort(
      args.wsPort,
      'listSprites',
      [],
      { pageUrlMatch: args.pageUrlMatch }
    );
    const hit = (sprites ?? []).find(
      (s) =>
        s.name === 'symbolSprite' &&
        /SymbolView › 0 › symbolSprite/.test(s.path ?? '')
    );
    if (!hit?.id) throw new Error('未找到 SymbolView/0/symbolSprite，请确保试玩页已加载转轴');
    nodeId = hit.id;
    console.error(`[test-single] 自动定位 ${nodeId} ${hit.path}`);
  }

  const dl = await callBridgeAtPort(
    args.wsPort,
    'downloadTexture',
    [nodeId, { delivery: 'share', wsPort: args.wsPort }],
    { pageUrlMatch: args.pageUrlMatch }
  );
  if (!dl?.ok) throw new Error(dl?.error ?? 'downloadTexture(originalCanvas) 失败');

  const detail = dl.detail ?? {};
  const frameRect = detail.frameRect;
  if (!frameRect) throw new Error('downloadTexture 无 frameRect 元数据');

  const uiW = detail.originalSize?.w ?? detail.displaySize?.w ?? dl.width;
  const uiH = detail.originalSize?.h ?? detail.displaySize?.h ?? dl.height;
  const sizeMode = parseInt(String(detail.sizeMode ?? '2'), 10);

  if (dl.width !== uiW || dl.height !== uiH) {
    console.error(
      `[test-single] PNG ${dl.width}x${dl.height} 与布局 ${uiW}x${uiH} 不一致，` +
        '请 chrome://extensions 重载 Inspector 后重试'
    );
    process.exit(2);
  }

  const stem = `${detail.frameName ?? 'sprite'}_${nodeId}`.replace(
    /[^a-zA-Z0-9._-]+/g,
    '_'
  );
  const rel = `assets/recovered/godeebxp/test/${stem}.png`;
  const abs = path.join(args.project, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (dl.sharePath) {
    fs.copyFileSync(resolveSharePath(dl.sharePath), abs);
  } else if (dl.base64) {
    fs.writeFileSync(abs, Buffer.from(dl.base64, 'base64'));
  } else {
    throw new Error('downloadTexture 无 sharePath/base64');
  }

  const place = trimPlace(
    { w: uiW, h: uiH },
    { w: frameRect.w, h: frameRect.h },
    detail.offset ?? { x: 0, y: 0 }
  );
  resetSpriteMetaTrimOnDisk(`${abs}.meta`, abs);

  const dbUrl = `db://${rel.replace(/\\/g, '/')}`;
  console.error(
    `[test-single] frame ${frameRect.w}x${frameRect.h} @ (${place.x},${place.y})` +
      ` → PNG ${uiW}x${uiH} sizeMode=${sizeMode}`
  );
  console.error(`[test-single] 写入 ${abs}`);

  const sceneUrl = `db://${args.sceneRel.replace(/\\/g, '/')}`;
  const pathSuffix = args.nodePath.replace(/^main › /, '').replace(/\//g, ' › ');

  const result = await execEval(
    args.bridge,
    `
const sceneUrl = ${JSON.stringify(sceneUrl)};
const dbUrl = ${JSON.stringify(dbUrl)};
const pathSuffix = ${JSON.stringify(pathSuffix)};
const uiW = ${uiW};
const uiH = ${uiH};
const sizeMode = ${Number.isFinite(sizeMode) ? sizeMode : 2};

await Editor.Message.request('scene', 'open-scene', (await Editor.Message.request('asset-db', 'query-asset-info', sceneUrl)).uuid);
await Editor.Message.request('asset-db', 'refresh-asset', dbUrl);
await new Promise((r) => setTimeout(r, 600));

const info = await Editor.Message.request('asset-db', 'query-asset-info', dbUrl);
const sfUuid = info?.subAssets?.f9941?.uuid;
if (!sfUuid) throw new Error('spriteFrame 未就绪: ' + dbUrl);

function findBySuffix(tree, suffix) {
  const parts = suffix.split(' › ');
  function walk(n, acc) {
    const p = [...acc, n.name];
  const rel = p.join(' › ');
    if (rel.endsWith(suffix) || rel === suffix) return n;
    for (const c of n.children || []) {
      const hit = walk(c, p);
      if (hit) return hit;
    }
    return null;
  }
  return walk(tree, []);
}

const tree = await Editor.Message.request('scene', 'query-node-tree');
const hit = findBySuffix(tree, pathSuffix);
if (!hit?.uuid) throw new Error('未找到节点: ' + pathSuffix);

const nodeUuid = hit.uuid;
try {
  const hasSprite = await Editor.Message.request('scene', 'query-property', {
    uuid: nodeUuid,
    path: 'cc.Sprite',
  });
  if (!hasSprite) {
    await Editor.Message.request('scene', 'create-component', {
      uuid: nodeUuid,
      component: 'cc.Sprite',
    });
  }
} catch (_) {}

await Editor.Message.request('scene', 'set-property', {
  uuid: nodeUuid,
  path: 'cc.Sprite.spriteFrame',
  dump: { type: 'cc.SpriteFrame', value: { uuid: sfUuid } },
});
await Editor.Message.request('scene', 'set-property', {
  uuid: nodeUuid,
  path: 'cc.Sprite.sizeMode',
  dump: { value: sizeMode },
});
await Editor.Message.request('scene', 'set-property', {
  uuid: nodeUuid,
  path: 'cc.UITransform.contentSize',
  dump: { type: 'cc.Size', value: { width: uiW, height: uiH } },
});

return { nodeUuid, path: hit.path ?? pathSuffix, sfUuid, uiW, uiH, sizeMode, dbUrl };
`
  );

  console.log(JSON.stringify({ ok: true, png: abs, detail, creator: result }, null, 2));
  console.error('[test-single] 完成');
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
