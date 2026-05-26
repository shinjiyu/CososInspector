import { mkdirSync, readdirSync, statSync, existsSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import JSZip from 'jszip';

export async function extractZipBuffer(buffer, destDir) {
  const zip = await JSZip.loadAsync(buffer);
  mkdirSync(destDir, { recursive: true });

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const safe = name.replace(/^(\.\.(\/|\\|$))+/, '').replace(/^[/\\]+/, '');
    if (!safe || safe.includes('..')) continue;
    const out = join(destDir, safe);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, await entry.async('nodebuffer'));
  }
}

/** 定位含 manifest.json 的目录（支持 zip 内多一层文件夹） */
export function findPackRoot(dir) {
  if (existsSync(join(dir, 'manifest.json'))) return dir;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    try {
      return findPackRoot(p);
    } catch {
      /* try next */
    }
  }
  throw new Error('未找到 manifest.json，请上传 Inspector 导出的替换包（zip 或含 manifest + images）');
}
