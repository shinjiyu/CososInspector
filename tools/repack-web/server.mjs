#!/usr/bin/env node
/**
 * Cocos 试玩换皮 — Web 重打包服务
 * 用户上传替换包 zip → 服务端 repack → 下载 repacked.html（zip）
 */
import express from 'express';
import multer from 'multer';
import JSZip from 'jszip';
import { randomUUID } from 'crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { extractZipBuffer, findPackRoot } from './unpack.mjs';

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'));
const webRoot = dirname(fileURLToPath(import.meta.url));
const jobsRoot = join(webRoot, 'tmp', 'jobs');

const PORT = Number(process.env.REPACK_WEB_PORT ?? 8787);
const HOST = process.env.REPACK_WEB_HOST ?? '127.0.0.1';
const BASE_PATH = (process.env.REPACK_WEB_BASE_PATH ?? '')
  .replace(/\/+$/, '')
  .replace(/^([^/])/, '/$1');
const MAX_MB = Number(process.env.REPACK_WEB_MAX_MB ?? 80);
const HTML_MAX_MB = Number(process.env.REPACK_WEB_HTML_MAX_MB ?? 50);
const HTML_FETCH_MS = Number(process.env.REPACK_WEB_HTML_FETCH_MS ?? 60_000);
const JOB_TTL_MS = Number(process.env.REPACK_WEB_JOB_TTL_MS ?? 60 * 60 * 1000);

mkdirSync(jobsRoot, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
});

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

const api = express.Router();

function apiPath(p) {
  return BASE_PATH ? `${BASE_PATH}${p}` : p;
}

function scheduleCleanup(jobDir) {
  setTimeout(() => {
    try {
      rmSync(jobDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }, JOB_TTL_MS);
}

function guessPageUrlFromManifest(manifest) {
  return manifest?.pageUrl ?? 'https://local/repack-web';
}

function runRepack({ htmlPath, packDir, outHtml }) {
  const r = spawnSync(
    process.execPath,
    [
      join(repoRoot, 'tools/repack-super-html.mjs'),
      '--html',
      htmlPath,
      '--pack',
      packDir,
      '--out',
      outHtml,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  if (r.status !== 0) {
    const detail = [r.stderr, r.stdout].filter(Boolean).join('\n').trim();
    throw new Error(detail || `repack 失败 (exit ${r.status ?? 1})`);
  }
  return r.stdout?.trim() ?? '';
}

async function fetchPlayableHtmlFromUrl(urlRaw) {
  let url;
  try {
    url = new URL(String(urlRaw).trim());
  } catch {
    throw new Error('htmlUrl 不是合法 URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('htmlUrl 仅支持 http:// 或 https://');
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), HTML_FETCH_MS);
  try {
    const res = await fetch(url.href, {
      redirect: 'follow',
      signal: ac.signal,
      headers: { 'User-Agent': 'CososInspector-repack-web/1.0' },
    });
    if (!res.ok) {
      throw new Error(`拉取试玩 HTML 失败: HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > HTML_MAX_MB * 1024 * 1024) {
      throw new Error(`试玩 HTML 超过 ${HTML_MAX_MB} MB`);
    }
    if (buf.length < 32) {
      throw new Error('拉取到的试玩 HTML 内容过短');
    }
    return buf;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`拉取试玩 HTML 超时（${HTML_FETCH_MS}ms）`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} jobDir
 * @param {import('multer').File | undefined} htmlFile
 * @param {string | undefined} htmlUrl
 */
async function resolvePlayableHtmlPath(jobDir, htmlFile, htmlUrl) {
  const htmlPath = join(jobDir, 'source.html');

  if (htmlFile) {
    if (!/\.html?$/i.test(htmlFile.originalname || '')) {
      throw new Error('试玩 HTML 请使用 .html 文件');
    }
    writeFileSync(htmlPath, htmlFile.buffer);
    return { htmlPath, source: 'file', label: htmlFile.originalname || 'source.html' };
  }

  const url = htmlUrl?.trim();
  if (url) {
    const buf = await fetchPlayableHtmlFromUrl(url);
    writeFileSync(htmlPath, buf);
    return { htmlPath, source: 'url', label: url };
  }

  throw new Error(
    '必须提供原版试玩 HTML：上传 html 文件，或在表单字段 htmlUrl 填写试玩页地址'
  );
}

async function saveUploadFiles(files, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const f of files) {
    const base = (f.originalname || 'file').replace(/^(\.\.(\/|\\|$))+/, '');
    const out = join(destDir, base);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, f.buffer);
  }
}

api.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    requiresPlayableHtml: true,
    playableHtml: 'file upload (html) or htmlUrl field',
    maxPackUploadMb: MAX_MB,
    maxHtmlFetchMb: HTML_MAX_MB,
    basePath: BASE_PATH || '/',
  });
});

api.post(
  '/api/repack',
  upload.fields([
    { name: 'pack', maxCount: 1 },
    { name: 'html', maxCount: 1 },
    { name: 'files', maxCount: 200 },
  ]),
  async (req, res) => {
    const jobId = randomUUID().slice(0, 8);
    const jobDir = join(jobsRoot, jobId);
    const uploadDir = join(jobDir, 'upload');
    const packDir = join(jobDir, 'pack');
    const outDir = join(jobDir, 'out');

    try {
      mkdirSync(jobDir, { recursive: true });

      const packFile = req.files?.pack?.[0];
      const htmlFile = req.files?.html?.[0];
      const looseFiles = req.files?.files ?? [];
      const htmlUrl =
        typeof req.body?.htmlUrl === 'string' ? req.body.htmlUrl : '';

      if (!packFile && looseFiles.length === 0) {
        res.status(400).json({
          ok: false,
          error: '请上传替换包 zip（字段 pack），或选择 manifest + 图片文件（字段 files）',
        });
        return;
      }

      mkdirSync(uploadDir, { recursive: true });

      if (packFile) {
        if (!/\.zip$/i.test(packFile.originalname || '')) {
          res.status(400).json({ ok: false, error: '替换包请使用 .zip 格式' });
          return;
        }
        await extractZipBuffer(packFile.buffer, uploadDir);
      } else {
        await saveUploadFiles(looseFiles, uploadDir);
      }

      const packRoot = findPackRoot(uploadDir);
      rmSync(packDir, { recursive: true, force: true });
      mkdirSync(packDir, { recursive: true });

      for (const name of readdirSync(packRoot)) {
        const src = join(packRoot, name);
        const dest = join(packDir, name);
        if (statSync(src).isDirectory()) {
          cpDir(src, dest);
        } else {
          mkdirSync(dirname(dest), { recursive: true });
          writeFileSync(dest, readFileSync(src));
        }
      }

      const { htmlPath, source: htmlSource, label: htmlLabel } =
        await resolvePlayableHtmlPath(jobDir, htmlFile, htmlUrl);

      const manifest = JSON.parse(
        readFileSync(join(packDir, 'manifest.json'), 'utf8')
      );
      const pageUrl = guessPageUrlFromManifest(manifest);
      const baseName =
        (htmlPath.match(/([^/\\]+)\.html?$/i)?.[1] ?? 'playable').replace(
          /\.html?$/i,
          ''
        ) || 'playable';
      const outHtml = join(outDir, `repacked_${baseName}.html`);
      mkdirSync(outDir, { recursive: true });

      const log = runRepack({ htmlPath, packDir, outHtml });

      const htmlBuf = readFileSync(outHtml);
      const zip = new JSZip();
      zip.file(basename(outHtml), htmlBuf);
      zip.file(
        'README.txt',
        [
          'Cocos Inspector 重打包结果',
          '',
          `生成时间: ${new Date().toISOString()}`,
          `替换条数: ${manifest.replacements?.length ?? 0}`,
          '',
          '本地预览（不要用 file://）：',
          '  npx serve .',
          '  浏览器打开 repacked_*.html',
          '',
          log,
        ].join('\n')
      );
      const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
      const zipPath = join(outDir, `repacked_${baseName}.zip`);
      writeFileSync(zipPath, zipBuf);

      scheduleCleanup(jobDir);

      res.json({
        ok: true,
        jobId,
        replacementCount: manifest.replacements?.length ?? 0,
        playableHtmlSource: htmlSource,
        playableHtmlLabel: htmlLabel,
        downloads: {
          html: apiPath(`/api/download/${jobId}/html`),
          zip: apiPath(`/api/download/${jobId}/zip`),
        },
        fileName: basename(outHtml),
        log: log.slice(-2000),
      });
    } catch (e) {
      try {
        rmSync(jobDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
);

function basename(p) {
  return p.split(/[/\\]/).pop() ?? p;
}

function cpDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) cpDir(s, d);
    else {
      mkdirSync(dirname(d), { recursive: true });
      writeFileSync(d, readFileSync(s));
    }
  }
}

app.get('/api/download/:jobId/:kind', (req, res) => {
  const { jobId, kind } = req.params;
  if (!/^[a-f0-9-]{6,36}$/i.test(jobId)) {
    res.status(400).end();
    return;
  }
  const outDir = join(jobsRoot, jobId, 'out');
  if (!existsSync(outDir)) {
    res.status(404).json({ ok: false, error: '任务不存在或已过期' });
    return;
  }
  const files = readdirSync(outDir);
  const pick =
    kind === 'zip'
      ? files.find((f) => f.endsWith('.zip'))
      : files.find((f) => f.endsWith('.html'));
  if (!pick) {
    res.status(404).json({ ok: false, error: '文件未找到' });
    return;
  }
  const abs = join(outDir, pick);
  res.download(abs, pick);
});

if (BASE_PATH) {
  app.use(BASE_PATH, api);
  app.use(
    BASE_PATH,
    express.static(join(webRoot, 'public'), {
      index: 'index.html',
      maxAge: 0,
    })
  );
  app.get(BASE_PATH, (_req, res) => {
    res.redirect(302, `${BASE_PATH}/`);
  });
} else {
  app.use(api);
  app.use(
    '/',
    express.static(join(webRoot, 'public'), {
      index: 'index.html',
      maxAge: 0,
    })
  );
}

app.listen(PORT, HOST, () => {
  const pub = BASE_PATH ? `${BASE_PATH} @ ` : '';
  console.log(`[repack-web] listening ${HOST}:${PORT} ${pub}`);
  console.log('[repack-web] 试玩 HTML：必填（上传 .html 或表单 htmlUrl）');
  console.log(`[repack-web] 替换包上传上限 ${MAX_MB} MB`);
});
