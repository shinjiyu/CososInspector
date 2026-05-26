/** Node 侧重打包命令（与 src/cocos3/repackHints.ts 保持一致） */

export function guessPlayableHtmlName(pageUrl) {
  try {
    const name = new URL(pageUrl).pathname.split('/').pop() ?? '';
    if (/\.html?$/i.test(name)) return name;
    if (name) return `${name}.html`;
  } catch {
    /* ignore */
  }
  return 'applovin2103.html';
}

export function defaultProbeHtmlPath(pageUrl) {
  return `tools/_probe/${guessPlayableHtmlName(pageUrl)}`;
}

export function buildRepackCommand(opts) {
  const html = opts.htmlPath ?? defaultProbeHtmlPath(opts.pageUrl);
  const base = guessPlayableHtmlName(opts.pageUrl).replace(/\.html?$/i, '');
  const outName = opts.outFileName ?? `repacked_${base}.html`;
  const pack = String(opts.packDir).replace(/\\/g, '/');
  const out = `${pack.replace(/\/$/, '')}/${outName}`;
  return `node tools/repack-super-html.mjs --html ${html} --pack ${pack} --out ${out}`;
}

export function projectPackDir(prefix) {
  return `tmp/mcp-share/out/${prefix}`;
}
