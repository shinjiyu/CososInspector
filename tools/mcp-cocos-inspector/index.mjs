#!/usr/bin/env node
/**
 * MCP ↔ Cocos Inspector 3（Chrome 扩展 + 试玩页 window.__cocosInspectorApi）
 *
 * 前置：
 *   1. 安装并启用 Cocos Inspector 3 扩展，打开 Cocos 试玩页
 *   2. Chrome: --remote-debugging-port=9222
 *   3. npm install（本目录）
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
  captureTabScreenshot,
  ensureConnected,
  getConnectedPageUrl,
  invokeInPage,
} from './cdp.mjs';

const repoRoot = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'));

function cdpOpts(args) {
  return {
    port: args?.cdpPort ? Number(args.cdpPort) : undefined,
    pageUrlMatch: args?.pageUrlMatch ?? process.env.COCOS_PAGE_URL_MATCH,
  };
}

async function apiCall(method, argList, opts) {
  const argsJson = JSON.stringify(argList ?? []);
  return invokeInPage(
    `const api = window.__cocosInspectorApi;
     if (!api) throw new Error('__cocosInspectorApi 未就绪：请确认已加载 Cocos Inspector 扩展且页面为 Cocos 试玩');
     const fn = api[${JSON.stringify(method)}];
     if (typeof fn !== 'function') throw new Error('未知 API: ${method}');
     return await fn(...${argsJson});`,
    opts
  );
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
        '列出 Chrome 远程调试中的页面标签（用于确认 CDP 已连接）',
      inputSchema: {
        type: 'object',
        properties: {
          cdpPort: { type: 'number', description: '默认 9222' },
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
      description: '用 base64 图片替换节点 Sprite（会记入替换包会话）',
      inputSchema: {
        type: 'object',
        properties: {
          nodeId: { type: 'string' },
          imageBase64: { type: 'string' },
          mime: { type: 'string' },
          filename: { type: 'string' },
          pageUrlMatch: { type: 'string' },
          cdpPort: { type: 'number' },
        },
        required: ['nodeId', 'imageBase64'],
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
      description: '导出替换包到目录（manifest + images + README + repack 命令）',
      inputSchema: {
        type: 'object',
        properties: {
          outDir: { type: 'string', description: '输出目录，默认 tmp/' },
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
  const opts = cdpOpts(args ?? {});

  try {
    if (name === 'cocos_list_tabs') {
      const CDP = (await import('chrome-remote-interface')).default;
      const port = Number(args?.cdpPort ?? process.env.COCOS_CDP_PORT ?? 9222);
      const targets = await CDP.List({ port });
      const pages = targets
        .filter((t) => t.type === 'page')
        .map((t) => ({ title: t.title, url: t.url, id: t.id }));
      return {
        content: [{ type: 'text', text: JSON.stringify({ port, pages }, null, 2) }],
      };
    }

    if (name === 'cocos_page_info') {
      await ensureConnected(opts);
      const info = await apiCall('getPageInfo', [], opts);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { connectedPage: getConnectedPageUrl(), ...info },
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
      const outPath = resolve(args.outPath);
      writeBase64File(outPath, res.base64);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                saved: outPath,
                width: res.width,
                height: res.height,
                filename: res.filename,
                detail: res.detail,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === 'cocos_replace_texture') {
      const res = await apiCall(
        'replaceTexture',
        [
          args.nodeId,
          args.imageBase64,
          { mime: args.mime, filename: args.filename },
        ],
        opts
      );
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
      const res = await apiCall('exportReplacementPack', [], opts);
      if (!res?.ok) {
        return {
          content: [{ type: 'text', text: JSON.stringify(res, null, 2) }],
          isError: true,
        };
      }
      const outDir = resolve(args?.outDir ?? join(repoRoot, 'tmp', res.data.prefix));
      mkdirSync(outDir, { recursive: true });
      for (const f of res.data.files) {
        writeBase64File(join(outDir, f.path), f.base64);
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                outDir,
                prefix: res.data.prefix,
                pageUrl: res.data.pageUrl,
                repackCommand: res.data.repackCommand,
                fileCount: res.data.files.length,
              },
              null,
              2
            ),
          },
        ],
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
        await ensureConnected(opts);
        base64 = await captureTabScreenshot(opts);
        meta = { kind: 'tab', connectedPage: getConnectedPageUrl() };
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

const transport = new StdioServerTransport();
await server.connect(transport);
