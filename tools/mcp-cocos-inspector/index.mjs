#!/usr/bin/env node
/**
 * MCP ↔ Cocos Inspector 3
 *
 * 默认：本机 WebSocket 桥接（普通 Chrome + 扩展，无需 --remote-debugging-port）
 * 可选：COCOS_USE_CDP=1 时使用 Chrome 远程调试（9222）
 */

import { spawn } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  connectBridgeClientOnly,
  startBridge,
  bridgeApiCall,
  bridgeCaptureVisibleTab,
  isExtensionConnected,
  bridgeGetStatus,
  getLastTabs,
  waitForExtension,
} from './bridge-server.mjs';
import { writeReplacementPackToDisk } from './export-pack-lib.mjs';
import { startShareHttp } from './share-http.mjs';
import {
  stageInputFile,
  shareFileUrl,
  writeShareOutput,
  getShareHttpPort,
  getShareDir,
} from './shared-fs.mjs';
import {
  captureTabScreenshot,
  ensureConnected,
  getConnectedPageUrl,
  invokeInPage,
} from './cdp.mjs';

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'));
const useCdp = process.env.COCOS_USE_CDP === '1';

function connOpts(args) {
  return {
    port: args?.cdpPort ? Number(args.cdpPort) : undefined,
    pageUrlMatch: args?.pageUrlMatch ?? process.env.COCOS_PAGE_URL_MATCH,
  };
}

async function cdpApiCall(method, argList, opts) {
  const argsJson = JSON.stringify(argList ?? []);
  return invokeInPage(
    `const api = window.__cocosInspectorApi;
     if (!api) throw new Error('__cocosInspectorApi 未就绪');
     const fn = api[${JSON.stringify(method)}];
     if (typeof fn !== 'function') throw new Error('未知 API: ${method}');
     return await fn(...${argsJson});`,
    opts
  );
}

async function apiCall(method, argList, opts) {
  if (useCdp) return cdpApiCall(method, argList, opts);
  return bridgeApiCall(method, argList, connOpts(opts));
}

function writeBase64File(outPath, base64) {
  const dir = dirname(outPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(outPath, Buffer.from(base64, 'base64'));
}

const server = new Server(
  {
    name: 'cocos-inspector',
    version: '0.1.0',
  },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'cocos_list_tabs',
      description:
        '桥接模式：扩展是否已连接 + 浏览器 http 标签；CDP 模式需 COCOS_USE_CDP=1',
      inputSchema: {
        type: 'object',
        properties: {
          cdpPort: { type: 'number', description: '仅 CDP 模式' },
        },
      },
    },
    {
      name: 'cocos_page_info',
      description: '当前试玩页：URL、引擎版本、场景名',
      inputSchema: {
        type: 'object',
        properties: {
          pageUrlMatch: { type: 'string' },
          cdpPort: { type: 'number' },
        },
      },
    },
    {
      name: 'cocos_list_sprites',
      description:
        '列出所有带贴图的 Sprite 节点（nodeId、名称、帧名、路径）。用于 Cursor 判断 UI 纹理',
      inputSchema: {
        type: 'object',
        properties: {
          pageUrlMatch: { type: 'string' },
          cdpPort: { type: 'number' },
        },
      },
    },
    {
      name: 'cocos_get_sprite',
      description: '获取单个 Sprite 元数据（frameRect、isRotated、尺寸等）',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          pageUrlMatch: { type: 'string' },
          cdpPort: { type: 'number' },
        },
        required: ['nodeId'],
      },
    },
    {
      name: 'cocos_download_texture',
      description: '提取节点纹理 PNG 并保存到本地路径',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          outPath: { type: 'string', description: '输出 .png 路径' },
          pageUrlMatch: { type: 'string' },
          cdpPort: { type: 'number' },
        },
        required: ['nodeId', 'outPath'],
      },
    },
    {
      name: 'cocos_replace_texture',
      description:
        '替换节点 Sprite。优先 imagePath（落盘共享目录，信道只传路径）；否则 imageBase64',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          imagePath: {
            type: 'string',
            description: '本地图片路径，写入 tmp/mcp-share/in/ 后经 HTTP 拉取',
          },
          imageBase64: { type: 'string' },
          mime: { type: 'string' },
          filename: { type: 'string' },
          pageUrlMatch: { type: 'string' },
          cdpPort: { type: 'number' },
        },
        required: ['nodeId'],
      },
    },
    {
      name: 'cocos_revert_texture',
      description: '还原节点为上传替换前的 SpriteFrame',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          pageUrlMatch: { type: 'string' },
          cdpPort: { type: 'number' },
        },
        required: ['nodeId'],
      },
    },
    {
      name: 'cocos_list_replacements',
      description: '列出当前页已记录的替换对',
      inputSchema: {
        type: 'object',
        properties: {
          pageUrlMatch: { type: 'string' },
          cdpPort: { type: 'number' },
        },
      },
    },
    {
      name: 'cocos_export_replacement_pack',
      description:
        '从试玩页导出替换包 zip（与扩展面板一致）；可写 outZip 路径，或落盘 tmp 后由 repack-web 上传',
      inputSchema: {
        type: 'object',
        properties: {
          outDir: { type: 'string', description: '输出目录（解压写入，可选）' },
          outZip: { type: 'string', description: '直接保存 .zip 路径' },
          pageUrlMatch: { type: 'string' },
          cdpPort: { type: 'number' },
        },
      },
    },
    {
      name: 'cocos_repack_super_html',
      description: '对本机试玩 HTML 执行 super-html 重打包（Node 脚本）',
      inputSchema: {
        type: 'object',
        properties: {
          html: { type: 'string', description: '原版试玩 .html 路径' },
          packDir: { type: 'string', description: '替换包目录' },
          out: { type: 'string', description: '输出 html 路径' },
          dryRun: { type: 'boolean' },
        },
        required: ['html', 'packDir'],
      },
    },
    {
      name: 'cocos_screenshot',
      description:
        '截屏：game=游戏 Canvas；node=单节点；tab=整页标签（含 UI，经 CDP）',
      inputSchema: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['game', 'node', 'tab'],
            description: '默认 game',
          },
          nodeId: { type: 'string', description: 'kind=node 时必填' },
          outPath: { type: 'string', description: '保存 png 路径' },
          maxSize: { type: 'number', description: 'node 模式最大边' },
          pageUrlMatch: { type: 'string' },
          cdpPort: { type: 'number' },
        },
        required: ['outPath'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const opts = connOpts(args ?? {});

  try {
    if (name === 'cocos_list_tabs') {
      if (useCdp) {
        const CDP = (await import('chrome-remote-interface')).default;
        const port = Number(args?.cdpPort ?? process.env.COCOS_CDP_PORT ?? 9222);
        const targets = await CDP.List({ port });
        const pages = targets
          .filter((t) => t.type === 'page')
          .map((t) => ({ title: t.title, url: t.url, id: t.id }));
        return {
          content: [
            { type: 'text', text: JSON.stringify({ mode: 'cdp', port, pages }, null, 2) },
          ],
        };
      }
      const st = useCdp ? null : await bridgeGetStatus().catch(() => ({}));
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                mode: 'bridge',
                bridgePort: Number(process.env.COCOS_BRIDGE_PORT ?? 17373),
                extensionConnected: st?.extensionConnected ?? (await isExtensionConnected()),
                tabs: st?.tabs ?? getLastTabs(),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === 'cocos_page_info') {
      if (useCdp) await ensureConnected(opts);
      const info = await apiCall('getPageInfo', [], opts);
      const st = useCdp ? null : await bridgeGetStatus().catch(() => ({}));
      const connectedPage = useCdp
        ? getConnectedPageUrl()
        : info?.pageUrl ?? st?.tabs?.find((t) => t.url)?.url;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                mode: useCdp ? 'cdp' : 'bridge',
                extensionConnected:
                  st?.extensionConnected ?? (await isExtensionConnected()),
                connectedPage,
                ...info,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === 'cocos_list_sprites') {
      const list = await apiCall('listSprites', [], opts);
      return {
        content: [{ type: 'text', text: JSON.stringify(list, null, 2) }],
      };
    }

    if (name === 'cocos_get_sprite') {
      const res = await apiCall('getSpriteDetail', [args.nodeId], opts);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
      };
    }

    if (name === 'cocos_download_texture') {
      const res = await apiCall('downloadTexture', [args.nodeId], opts);
      if (!res?.ok) {
        return {
          content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
          isError: true,
        };
      }
      const shareRel = writeShareOutput(
        res.filename ?? `${args.nodeId}.png`,
        res.base64
      );
      const outPath = args.outPath ? resolve(args.outPath) : null;
      if (outPath) {
        writeBase64File(outPath, res.base64);
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                shareDir: getShareDir(),
                sharePath: shareRel,
                shareUrl: shareFileUrl(shareRel),
                saved: outPath ?? undefined,
                width: res.width,
                height: res.height,
                filename: res.filename,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === 'cocos_replace_texture') {
      let res;
      if (args.imagePath) {
        const rel = stageInputFile(resolve(args.imagePath));
        res = await apiCall(
          'replaceTextureFromShare',
          [
            args.nodeId,
            rel,
            {
              mime: args.mime,
              filename: args.filename,
              shareBaseUrl: `http://127.0.0.1:${getShareHttpPort()}`,
            },
          ],
          opts
        );
      } else if (args.imageBase64) {
        res = await apiCall(
          'replaceTexture',
          [
            args.nodeId,
            args.imageBase64,
            { mime: args.mime, filename: args.filename },
          ],
          opts
        );
      } else {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                ok: false,
                error: '需要 imagePath 或 imageBase64',
              }),
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
        isError: res?.ok === false,
      };
    }

    if (name === 'cocos_revert_texture') {
      const res = await apiCall('revertTexture', [args.nodeId], opts);
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
        isError: res?.ok === false,
      };
    }

    if (name === 'cocos_list_replacements') {
      const list = await apiCall('listReplacements', [], opts);
      return {
        content: [{ type: 'text', text: JSON.stringify(list, null, 2) }],
      };
    }

    if (name === 'cocos_export_replacement_pack') {
      if (!useCdp) await waitForExtension(60_000);
      const opts = connOpts(args);
      const zipRes = await apiCall('exportReplacementPack', [], opts);
      if (!zipRes?.ok) {
        return {
          content: [{ type: 'text', text: JSON.stringify(zipRes, null, 2) }],
          isError: true,
        };
      }
      const outZip = args?.outZip
        ? resolve(args.outZip)
        : resolve(
            repoRoot,
            'tmp',
            zipRes.data.zipName ?? `cocos-replacements.zip`
          );
      writeBase64File(outZip, zipRes.data.zipBase64);
      const summary = {
        savedZip: outZip,
        zipName: zipRes.data.zipName,
        replacementCount: zipRes.data.replacementCount,
        repackCommand: zipRes.data.repackCommand,
        repackWeb: 'http://127.0.0.1:8787 — 上传该 zip 打包',
      };
      if (args?.outDir) {
        const pack = await writeReplacementPackToDisk({
          pageUrlMatch: opts.pageUrlMatch,
          outDir: resolve(args.outDir),
        });
        Object.assign(summary, { unpackedDir: pack.outDir });
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
      };
    }

    if (name === 'cocos_repack_super_html') {
      const html = resolve(args.html);
      const packDir = resolve(args.packDir);
      const out = args.out ? resolve(args.out) : '';
      const script = join(repoRoot, 'tools/repack-super-html.mjs');
      const argv = [script, '--html', html, '--pack', packDir];
      if (out) argv.push('--out', out);
      if (args.dryRun) argv.push('--dry-run');

      const result = await new Promise((resolvePromise, reject) => {
        const child = spawn(process.execPath, argv, {
          cwd: repoRoot,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => (stdout += d));
        child.stderr.on('data', (d) => (stderr += d));
        child.on('close', (code) => {
          resolvePromise({ code, stdout, stderr });
        });
        child.on('error', reject);
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
        isError: result.code !== 0,
      };
    }

    if (name === 'cocos_screenshot') {
      const kind = args?.kind ?? 'game';
      const outPath = resolve(args.outPath);
      let base64;
      let meta = {};

      if (kind === 'tab') {
        if (useCdp) {
          await ensureConnected(opts);
          base64 = await captureTabScreenshot(opts);
          meta = { kind: 'tab', mode: 'cdp', connectedPage: getConnectedPageUrl() };
        } else {
          const res = await bridgeCaptureVisibleTab(opts.pageUrlMatch);
          if (!res?.ok) {
            return {
              content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
              isError: true,
            };
          }
          base64 = res.base64;
          meta = { kind: 'tab', mode: 'bridge' };
        }
      } else if (kind === 'node') {
        if (!args.nodeId) throw new Error('kind=node 需要 nodeId');
        const res = await apiCall(
          'captureNodeScreenshot',
          [args.nodeId, args.maxSize ?? 512],
          opts
        );
        if (!res?.ok) {
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
            isError: true,
          };
        }
        base64 = res.base64;
        meta = res;
      } else {
        const res = await apiCall('captureGameScreenshot', [], opts);
        if (!res?.ok) {
          return {
            content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
            isError: true,
          };
        }
        base64 = res.base64;
        meta = res;
      }

      writeBase64File(outPath, base64);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ saved: outPath, ...meta }, null, 2),
          },
        ],
      };
    }

    return {
      content: [{ type: 'text', text: `未知工具: ${name}` }],
      isError: true,
    };
  } catch (e) {
    return {
      content: [
        {
          type: 'text',
          text: e instanceof Error ? e.message : String(e),
        },
      ],
      isError: true,
    };
  }
});

const bridgePort = Number(process.env.COCOS_BRIDGE_PORT ?? 17373);

async function ensureBridgeReady() {
  try {
    await startShareHttp(getShareHttpPort());
  } catch (e) {
    if (e?.code !== 'EADDRINUSE') throw e;
  }

  try {
    await connectBridgeClientOnly(bridgePort);
    console.error(
      `[cocos-inspector] 已连接常驻桥接 ws://127.0.0.1:${bridgePort}（推荐另开终端: npm run cocos-bridge）`
    );
    return;
  } catch {
    /* 无守护进程时由本 MCP 进程托管桥接 */
  }

  await startBridge(bridgePort);
  try {
    await startShareHttp(getShareHttpPort());
  } catch (e) {
    if (e?.code !== 'EADDRINUSE') throw e;
  }
  console.error(
    `[cocos-inspector] 本进程已监听桥接 ws://127.0.0.1:${bridgePort}；请重载扩展并 F5 试玩页`
  );
}

await ensureBridgeReady();

const transport = new StdioServerTransport();
await server.connect(transport);
