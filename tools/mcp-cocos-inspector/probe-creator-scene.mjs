const res = await fetch('http://127.0.0.1:3921/exec', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    mode: 'eval',
    code: `
const sceneUrl = 'db://assets/scene/godeebxp_recovered.scene';
const info = await Editor.Message.request('asset-db', 'query-asset-info', sceneUrl);
if (info?.uuid) await Editor.Message.request('scene', 'open-scene', info.uuid);
await new Promise(r => setTimeout(r, 500));
const dirty = await Editor.Message.request('scene', 'query-dirty');
const tree = await Editor.Message.request('scene', 'query-node-tree');
return { dirty, treeName: tree?.name, treeUuid: tree?.uuid, childCount: tree?.children?.length, sceneAsset: info?.uuid };
`,
  }),
});
console.log(JSON.stringify(await res.json(), null, 2));
