const BRIDGE = process.env.COCOSMCP_BRIDGE ?? 'http://127.0.0.1:3921';

const code = `
const sceneUrl = 'db://assets/scene/godeebxp_recovered.scene';
const texUrl = 'db://assets/recovered/godeebxp/sprites/bg_blur_Node.2108.png';
const info = await Editor.Message.request('asset-db', 'query-asset-info', sceneUrl);
await Editor.Message.request('scene', 'open-scene', info.uuid);

function findNode(tree, name) {
  if (!tree) return null;
  if (tree.name === name) return tree;
  for (const c of tree.children || []) {
    const r = findNode(c, name);
    if (r) return r;
  }
  return null;
}

await Editor.Message.request('asset-db', 'refresh-asset', texUrl);
const texInfo = await Editor.Message.request('asset-db', 'query-asset-info', texUrl);
const sfUuid = texInfo?.subAssets?.f9941?.uuid;
if (!sfUuid) throw new Error('no sf uuid');

let tree = await Editor.Message.request('scene', 'query-node-tree');
const node = findNode(tree, 'bg_blur');
if (!node) throw new Error('bg_blur not found');

const tries = [];
for (const spec of [
  { uuid: node.uuid, path: 'cc.Sprite.spriteFrame' },
  { uuid: node.components?.find(c => c.type === 'cc.Sprite')?.value, path: 'spriteFrame' },
]) {
  if (!spec.uuid) continue;
  try {
    await Editor.Message.request('scene', 'set-property', {
      uuid: spec.uuid,
      path: spec.path,
      dump: { type: 'cc.SpriteFrame', value: { uuid: sfUuid } },
    });
    tries.push({ ok: true, ...spec });
  } catch (e) {
    tries.push({ ok: false, ...spec, err: String(e) });
  }
}

let prop = null;
try {
  prop = await Editor.Message.request('scene', 'query-property', {
    uuid: node.uuid,
    path: 'cc.Sprite.spriteFrame',
  });
} catch (e) {
  prop = { err: String(e) };
}

await Editor.Message.request('scene', 'save-scene');
const abs = path.join(Editor.Project.path, 'assets/scene/godeebxp_recovered.scene');
const text = fs.readFileSync(abs, 'utf8');
const hasSf = text.includes(sfUuid.split('@')[0]);
const nullSf = text.includes('"_spriteFrame": null');

return { sfUuid, tries, prop, diskHasImageUuid: hasSf, diskHasNullSpriteFrame: nullSf, nodeUuid: node.uuid };
`;

const res = await fetch(`${BRIDGE}/exec`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'eval', code }),
});
console.log(JSON.stringify(await res.json(), null, 2));
