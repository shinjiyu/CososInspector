const BRIDGE = process.env.COCOSMCP_BRIDGE ?? 'http://127.0.0.1:3921';

const code = `
const dbUrl = 'db://assets/recovered/godeebxp/sprites/probe_bgLeft.png';
await Editor.Message.request('asset-db', 'refresh-asset', dbUrl);
const info = await Editor.Message.request('asset-db', 'query-asset-info', dbUrl);
let meta = null;
try {
  meta = await Editor.Message.request('asset-db', 'query-asset-meta', dbUrl);
} catch (e) {
  meta = { err: String(e) };
}
const subMetas = meta?.userData?.subMetas ?? meta?.subMetas ?? null;
return { info, subMetas, metaUserData: meta?.userData ?? null };
`;

const res = await fetch(`${BRIDGE}/exec`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'eval', code }),
});
const body = await res.json();
console.log(JSON.stringify(body, null, 2));
