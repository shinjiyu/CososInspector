/**
 * 调用 repack-super-html 写回试玩 HTML
 */
import { spawnSync } from 'child_process';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
  defaultProbeHtmlPath,
  guessPlayableHtmlName,
} from './repack-hints.mjs';

const repoRoot = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '../..'));

/**
 * @param {{
 *   packDirAbs: string;
 *   packDirRel: string;
 *   pageUrl: string;
 *   htmlPath?: string;
 * }} opts
 */
export function runRepackForPack(opts) {
  const htmlRel = opts.htmlPath ?? defaultProbeHtmlPath(opts.pageUrl);
  const htmlAbs = join(repoRoot, htmlRel.replace(/^\//, ''));
  const base = guessPlayableHtmlName(opts.pageUrl).replace(/\.html?$/i, '');
  const outName = `repacked_${base}.html`;
  const outFile = join(opts.packDirAbs, outName);
  const packAbs = join(repoRoot, opts.packDirRel.replace(/\\/g, '/'));

  const r = spawnSync(
    process.execPath,
    [
      join(repoRoot, 'tools/repack-super-html.mjs'),
      '--html',
      htmlAbs,
      '--pack',
      packAbs,
      '--out',
      outFile,
    ],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );

  if (r.status !== 0) {
    const detail = [r.stderr, r.stdout].filter(Boolean).join('\n').trim();
    return {
      ok: false,
      error: detail || `repack-super-html 退出码 ${r.status ?? 1}`,
    };
  }

  const repackedHtmlRel = `${opts.packDirRel.replace(/\\/g, '/')}/${outName}`;
  return {
    ok: true,
    repackedHtmlAbs: outFile,
    repackedHtmlRel,
    previewHint: 'npx serve tmp/mcp-share/out',
    log: r.stdout?.trim() ?? '',
  };
}
