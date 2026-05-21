import { copyFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const minify = process.argv.includes('--minify');
const watch = process.argv.includes('--watch');

mkdirSync(dist, { recursive: true });

const minifyFlag = minify ? ['--minify'] : [];

async function build() {
  let esbuildMod = null;
  try {
    esbuildMod = await import('esbuild');
  } catch {
    /* 使用 npx 回退 */
  }

  const common = {
    bundle: true,
    format: 'iife',
    target: ['chrome90'],
    sourcemap: true,
    minify,
    logLevel: 'info',
  };

  if (esbuildMod) {
    const esbuild = esbuildMod.default ?? esbuildMod;
    const ctx = await esbuild.context({
      ...common,
      entryPoints: {
        content: join(root, 'src/content.ts'),
        injected: join(root, 'src/injected.ts'),
        background: join(root, 'src/background.ts'),
      },
      outdir: dist,
    });
    if (watch) {
      await ctx.watch();
      console.log('watching…');
    } else {
      await ctx.rebuild();
      await ctx.dispose();
    }
  } else {
    console.log('本地未安装 esbuild，使用 npx esbuild…');
    if (watch) {
      console.warn('npx 模式不支持 --watch，请先 npm install');
    }
    for (const [name, entry] of [
      ['content', 'src/content.ts'],
      ['injected', 'src/injected.ts'],
      ['background', 'src/background.ts'],
    ]) {
      const r = spawnSync(
        'npx',
        [
          '--yes',
          'esbuild',
          entry,
          '--bundle',
          `--outfile=dist/${name}.js`,
          '--format=iife',
          ...minifyFlag,
        ],
        { cwd: root, stdio: 'inherit', shell: true }
      );
      if (r.status !== 0) process.exit(r.status ?? 1);
    }
  }

  copyFileSync(
    join(root, 'src/styles/inspector.css'),
    join(dist, 'inspector.css')
  );
  console.log('build ok → dist/');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
