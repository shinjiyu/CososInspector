/** 生成 super-html 本地重打包命令（须在项目根目录用 Node 执行） */

export function guessPlayableHtmlName(pageUrl: string): string {
  try {
    const name = new URL(pageUrl).pathname.split('/').pop() ?? '';
    if (/\.html?$/i.test(name)) return name;
    if (name) return `${name}.html`;
  } catch {
    /* ignore */
  }
  return 'applovin2103.html';
}

export function defaultProbeHtmlPath(pageUrl: string): string {
  const name = guessPlayableHtmlName(pageUrl);
  return `tools/_probe/${name}`;
}

export interface RepackCommandOptions {
  pageUrl: string;
  /** 导出包目录（manifest + 扁平图片 或 images/ 子目录） */
  packDir: string;
  htmlPath?: string;
  outFileName?: string;
}

export function buildRepackCommand(opts: RepackCommandOptions): string {
  const html = opts.htmlPath ?? defaultProbeHtmlPath(opts.pageUrl);
  const base = guessPlayableHtmlName(opts.pageUrl).replace(/\.html?$/i, '');
  const outName = opts.outFileName ?? `repacked_${base}.html`;
  const pack = opts.packDir.replace(/\\/g, '/');
  const out = `${pack.replace(/\/$/, '')}/${outName}`;
  return `node tools/repack-super-html.mjs --html ${html} --pack ${pack} --out ${out}`;
}

export function buildRepackReadmeSection(
  opts: RepackCommandOptions & { count: number }
): string[] {
  const cmd = buildRepackCommand(opts);
  return [
    '--- super-html 重打包（Node，项目根目录）---',
    cmd,
    'npm install   # 首次需要 sharp',
    'npx serve ' + opts.packDir.replace(/\\/g, '/') + '   # 预览重打包 HTML',
    '',
  ];
}
