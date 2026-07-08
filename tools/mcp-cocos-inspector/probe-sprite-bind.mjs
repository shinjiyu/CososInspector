const BRIDGE = process.env.COCOSMCP_BRIDGE ?? 'http://127.0.0.1:3921';

const code = `
const dbUrl = 'db://assets/recovered/godeebxp/sprites/probe_bgLeft.png';
const sfUuid = '06d2c527-f4e1-459b-8795-fd0467df0ce0@f9941';
const sceneUrl = 'db://assets/scene/godeebxp_recovered.scene';
const info = await Editor.Message.request('asset-db', 'query-asset-info', sceneUrl);
await Editor.Message.request('scene', 'open-scene', info.uuid);
let tree = await Editor.Message.request('scene', 'query-node-tree');
function findNode(t, name) {
  if (!t) return null;
  if (t.name === name) return t;
  for (const c of t.children || []) { const r = findNode(c, name); if (r) return r; }
  return null;
}
const canvas = findNode(tree, 'Canvas');
const nodeUuid = await Editor.Message.request('scene', 'create-node', { parent: canvas.uuid, name: 'sprite_probe' });
const compUuid = await Editor.Message.request('scene', 'create-component', { uuid: nodeUuid, component: 'cc.Sprite' });
await Editor.Message.request('scene', 'create-component', { uuid: nodeUuid, component: 'cc.UITransform' });
const tries = [];
for (const spec of [
  { uuid: nodeUuid, path: 'cc.Sprite.spriteFrame' },
  { uuid: compUuid, path: 'spriteFrame' },
  { uuid: nodeUuid, path: '__comps__.1.spriteFrame' },
]) {
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
await Editor.Message.request('scene', 'save-scene');
tree = await Editor.Message.request('scene', 'query-node-tree');
const n = findNode(tree, 'sprite_probe');
return { tries, node: n };
`;

const res = await fetch(`${BRIDGE}/exec`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'eval', code }),
});
console.log(JSON.stringify(await res.json(), null, 2));
