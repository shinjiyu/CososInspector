import { mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'));

export function getShareDir() {
  return resolve(process.env.COCOS_MCP_SHARE_DIR ?? join(repoRoot, 'tmp', 'mcp-share'));
}

export function ensureShareDirs() {
  const root = getShareDir();
  mkdirSync(join(root, 'in'), { recursive: true });
  mkdirSync(join(root, 'out'), { recursive: true });
  return root;
}

/** @param {string} rel 相对路径，如 in/abc.png */
export function resolveSharePath(rel) {
  const root = getShareDir();
  const abs = resolve(root, rel);
  if (!abs.startsWith(root)) {
    throw new Error(`非法共享路径: ${rel}`);
  }
  return abs;
}

export function getShareHttpPort() {
  return Number(process.env.COCOS_SHARE_HTTP_PORT ?? 17374);
}

export function shareFileUrl(rel) {
  return `http://127.0.0.1:${getShareHttpPort()}/${rel.replace(/^\//, '')}`;
}

/** MCP 侧：把本地图片拷入 in/，返回相对路径 */
export function stageInputFile(localPath, ext = '.png') {
  ensureShareDirs();
  const name = `in/${Date.now()}-${randomBytes(4).toString('hex')}${ext}`;
  copyFileSync(localPath, resolveSharePath(name));
  return name;
}

/** 桥接侧：把 base64 写入 out/，返回相对路径 */
export function writeShareOutput(relName, base64) {
  ensureShareDirs();
  const rel = relName.startsWith('out/') ? relName : `out/${relName}`;
  const abs = resolveSharePath(rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, Buffer.from(base64, 'base64'));
  return rel;
}
