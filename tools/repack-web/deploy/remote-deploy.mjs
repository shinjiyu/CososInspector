#!/usr/bin/env node
/**
 * 一键部署到远程服务器（密码通过环境变量，勿写入仓库）
 *
 *   $env:DEPLOY_SSH_PASSWORD='...'
 *   node tools/repack-web/deploy/remote-deploy.mjs
 */
import { Client } from 'ssh2';
import { createReadStream, existsSync, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import { tmpdir } from 'os';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../../..');

const HOST = process.env.DEPLOY_HOST ?? '43.156.244.45';
const USER = process.env.DEPLOY_USER ?? 'root';
const PASS = process.env.DEPLOY_SSH_PASSWORD ?? '';
const REMOTE_DIR = process.env.DEPLOY_REMOTE_DIR ?? '/opt/cocos-repack-web';
const PUBLIC_URL =
  process.env.DEPLOY_PUBLIC_URL ?? 'https://kuroneko.chat/cocos-repack/';

if (!PASS) {
  console.error('请设置环境变量 DEPLOY_SSH_PASSWORD');
  process.exit(1);
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      let out = '';
      let errOut = '';
      stream.on('data', (d) => {
        out += d;
        process.stdout.write(d);
      });
      stream.stderr.on('data', (d) => {
        errOut += d;
        process.stderr.write(d);
      });
      stream.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`exit ${code}: ${errOut || out}`));
          return;
        }
        resolve(out);
      });
    });
  });
}

function sftpUpload(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(local, remote, (err) => (err ? reject(err) : resolve()));
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => resolve(conn))
      .on('error', reject)
      .connect({
        host: HOST,
        port: 22,
        username: USER,
        password: PASS,
        readyTimeout: 30_000,
      });
  });
}

async function main() {
  console.log(`[deploy] 打包源码 ${repoRoot}`);
  const tgz = join(tmpdir(), `cocos-repack-web-${Date.now()}.tar.gz`);
  const include = [
    'package.json',
    'package-lock.json',
    'tools/repack-web',
    'tools/repack-super-html.mjs',
    'tools/repack-atlas-patch.mjs',
    'tools/repack-zip-inline.mjs',
  ].filter((p) => existsSync(join(repoRoot, p)));
  if (!include.length) throw new Error('没有可打包的文件');
  const tarArgs = include.map((p) => `"${p.replace(/\\/g, '/')}"`).join(' ');
  execSync(`tar -czf "${tgz}" ${tarArgs}`, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
  });

  const conn = await connect();
  console.log('[deploy] 已连接', HOST);

  await exec(conn, `mkdir -p ${REMOTE_DIR}`);
  const sftp = await new Promise((resolve, reject) => {
    conn.sftp((err, s) => (err ? reject(err) : resolve(s)));
  });
  const remoteTgz = `${REMOTE_DIR}/release.tar.gz`;
  console.log('[deploy] 上传', remoteTgz);
  await sftpUpload(sftp, tgz, remoteTgz);

  const writeRemote = async (remotePath, text) => {
    const b64 = Buffer.from(text, 'utf8').toString('base64');
    await exec(conn, `echo '${b64}' | base64 -d > ${remotePath}`);
  };

  await writeRemote(
    '/etc/systemd/system/cocos-repack-web.service',
    readFileSync(join(__dir, 'cocos-repack-web.service'), 'utf8')
  );
  const setup = `
set -e
export DEBIAN_FRONTEND=noninteractive
command -v node >/dev/null || (curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs)
command -v nginx >/dev/null || apt-get install -y nginx
mkdir -p ${REMOTE_DIR} /etc/nginx/snippets
cd ${REMOTE_DIR}
tar -xzf release.tar.gz
npm install --omit=dev 2>/dev/null || npm install
cd tools/repack-web && npm install --omit=dev
systemctl daemon-reload
systemctl enable cocos-repack-web
systemctl restart cocos-repack-web
`;

  console.log('[deploy] 安装依赖并启动 systemd…');
  await exec(conn, setup);

  conn.end();

  console.log('[deploy] 配置 nginx 反向代理…');
  await new Promise((resolve, reject) => {
    const p = spawn('node', [join(__dir, 'fix-nginx.mjs')], {
      env: process.env,
      stdio: 'inherit',
    });
    p.on('close', (c) => (c ? reject(new Error('fix-nginx exit ' + c)) : resolve()));
  });

  try {
    const conn2 = await connect();
    const health = await exec(
      conn2,
      'curl -sS http://127.0.0.1:8787/cocos-repack/api/health'
    );
    console.log('[deploy] health:', health.trim());
    conn2.end();
  } catch (e) {
    console.warn('[deploy] 本地 health 检查失败:', e.message);
  }

  console.log(`\n[deploy] 完成 → ${PUBLIC_URL}`);
  console.log('[deploy] 请尽快修改 root 密码（已在聊天中暴露）');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
