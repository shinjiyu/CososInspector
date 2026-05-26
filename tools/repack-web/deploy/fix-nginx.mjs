#!/usr/bin/env node
/**
 * 在 kuroneko.chat 的 server 块内挂载 /cocos-repack/ 反向代理（与 relay 同模式）
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client } from 'ssh2';

const __dir = dirname(fileURLToPath(import.meta.url));
const PASS = process.env.DEPLOY_SSH_PASSWORD ?? '';
if (!PASS) {
  console.error('请设置 DEPLOY_SSH_PASSWORD');
  process.exit(1);
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let o = '';
      stream.on('data', (d) => {
        o += d;
        process.stdout.write(d);
      });
      stream.stderr.on('data', (d) => process.stderr.write(d));
      stream.on('close', (c) => (c ? reject(new Error(`exit ${c}`)) : resolve(o)));
    });
  });
}

const conn = await new Promise((resolve, reject) => {
  const c = new Client();
  c
    .on('ready', () => resolve(c))
    .on('error', reject)
    .connect({ host: '43.156.244.45', username: 'root', password: PASS });
});

const loc = readFileSync(join(__dir, 'nginx-kuroneko.chat.conf'), 'utf8');
const snippetPath = '/etc/nginx/conf.d/kuroneko-cocos-repack.conf';
const nginxConf = '/etc/nginx/nginx.conf';
const b64 = Buffer.from(loc, 'utf8').toString('base64');

await exec(
  conn,
  `sed -i '/snippets\\/cocos-repack.conf/d' ${nginxConf} /etc/nginx/conf.d/*.conf 2>/dev/null; true`
);
await exec(conn, `echo '${b64}' | base64 -d > ${snippetPath}`);

const patchScript = `python3 << 'PY'
from pathlib import Path
nginx = Path("${nginxConf}")
text = nginx.read_text(encoding="utf-8", errors="replace")
include_line = "        include /etc/nginx/conf.d/kuroneko-cocos-repack.conf;\\n"
relay = "        include /etc/nginx/conf.d/kuroneko-relay.conf;"
if "kuroneko-cocos-repack.conf" not in text:
    if relay not in text:
        print("NO_RELAY_INCLUDE")
        raise SystemExit(2)
    text = text.replace(relay, relay + "\\n" + include_line.strip())
    nginx.write_text(text, encoding="utf-8")
    print("ADDED_INCLUDE")
else:
    print("INCLUDE_EXISTS")
PY`;
await exec(conn, patchScript);
await exec(conn, 'nginx -t && systemctl reload nginx');

const health = await exec(
  conn,
  'curl -sS http://127.0.0.1/cocos-repack/api/health -H "Host: kuroneko.chat"'
);
console.log('[fix-nginx] health:', health.trim());

const code = await exec(
  conn,
  'curl -sS -o /dev/null -w "%{http_code}" https://kuroneko.chat/cocos-repack/api/health'
);
console.log('[fix-nginx] https status:', code.trim());
conn.end();
