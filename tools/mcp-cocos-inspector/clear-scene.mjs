const BRIDGE = process.env.COCOSMCP_BRIDGE ?? 'http://127.0.0.1:3921';

const code = `
const sceneUrl = 'db://assets/scene/godeebxp_recovered.scene';
try {
  const dirty = await Editor.Message.request('scene', 'query-dirty');
  if (dirty) await Editor.Message.request('scene', 'save-scene');
} catch (_) {}
const info = await Editor.Message.request('asset-db', 'query-asset-info', sceneUrl);
if (!info?.uuid) throw new Error('scene not found: ' + sceneUrl);
await Editor.Message.request('scene', 'open-scene', info.uuid);
let tree = await Editor.Message.request('scene', 'query-node-tree');
function collectRemoveOrder(node, out) {
  if (!node) return;
  for (const c of node.children || []) collectRemoveOrder(c, out);
  if (node.uuid) out.push(node.uuid);
}
const removeList = [];
for (const ch of tree.children || []) collectRemoveOrder(ch, removeList);
let removed = 0;
for (const u of removeList) {
  try {
    await Editor.Message.request('scene', 'remove-node', { uuid: u });
    removed += 1;
  } catch (_) {}
}
await Editor.Message.request('scene', 'save-scene');
tree = await Editor.Message.request('scene', 'query-node-tree');
const abs = path.join(Editor.Project.path, 'assets/scene/godeebxp_recovered.scene');
return {
  ok: true,
  scene: sceneUrl,
  removed,
  remainingChildren: (tree.children || []).length,
  diskSize: fs.existsSync(abs) ? fs.statSync(abs).size : 0,
};
`;

const res = await fetch(`${BRIDGE}/exec`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'eval', code }),
});
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
if (!body.ok) process.exit(1);
