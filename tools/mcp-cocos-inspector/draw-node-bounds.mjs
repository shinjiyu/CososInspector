#!/usr/bin/env node
/**
 * 在 H5 试玩页直接画节点红框（内联脚本，不依赖面板按钮）
 */
import {
  callBridgeAtPort,
  connectBridgeClientOnly,
  waitForExtension,
} from './bridge-server.mjs';

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const get = (flag, fallback) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    path: get(
      '--path',
      'viewRoot/GameView/content/gameLayer/SymbolView/0/symbolSprite'
    ),
    wsPort: Number(get('--ws-port', '17373')),
    pageUrlMatch: get('--page-url-match', 'godeebxp'),
    hide: argv.includes('--hide'),
  };
};

/** 在试玩页执行的绘制逻辑（自包含 IIFE） */
const buildDrawExpr = (pathSuffix, hide) => {
  const pathJson = JSON.stringify(pathSuffix);
  const hideFlag = hide ? 'true' : 'false';
  return `(function(){
    const pathSuffix = ${pathJson};
    const hide = ${hideFlag};
    const rootId = 'cocos-inspector-bounds-inline';
    const old = document.getElementById(rootId);
    if (old) old.remove();
    if (hide) return { ok: true, hidden: true };

    const ccg = window.cc;
    if (!ccg?.director) return { ok: false, error: 'cc 未就绪' };
    const scene = ccg.director.getScene();
    if (!scene) return { ok: false, error: 'scene 未就绪' };

    const canvas = ccg.game?.canvas || document.querySelector('canvas');
    if (!canvas) return { ok: false, error: 'canvas 未找到' };
    const cr = canvas.getBoundingClientRect();

    const norm = (p) => p.replace(/^main\\s*›\\s*Canvas\\s*›\\s*/i,'').replace(/\\s*›\\s*/g,'/').replace(/^\\/+/, '');
    const target = norm(pathSuffix);

    const findByPath = (node, parts) => {
      const rel = parts.join('/');
      if (rel === target || rel.endsWith('/' + target) || rel.endsWith(target)) return node;
      for (const ch of node.children || []) {
        const hit = findByPath(ch, [...parts, ch.name || '']);
        if (hit) return hit;
      }
      return null;
    };
    const node = findByPath(scene, [scene.name || 'main']);
    if (!node) return { ok: false, error: '未找到节点 ' + pathSuffix };

    const findComp = (n, re, ctor) => {
      if (ctor && n.getComponent) {
        try { const h = n.getComponent(ctor); if (h) return h; } catch (_) {}
      }
      const comps = n._components || [];
      return comps.find((c) => {
        const cn = c.__classname__ || (c.constructor && c.constructor.name) || '';
        return re.test(cn);
      }) || null;
    };
    const ui = findComp(node, /UITransform/, ccg.UITransform);
    if (!ui?.getBoundingBoxToWorld) {
      return { ok: false, error: '无 UITransform', compNames: (node._components||[]).map(c=>c.__classname__||c.constructor?.name) };
    }

    let camera = null;
    const walkCam = (n) => {
      if (n.name === 'UICamera' && ccg.Camera) {
        const c = n.getComponent(ccg.Camera);
        if (c) return c;
      }
      for (const ch of n.children || []) {
        const h = walkCam(ch);
        if (h) return h;
      }
      return null;
    };
    camera = walkCam(scene);

    const Vec3 = ccg.Vec3;
    const toClient = (wx, wy) => {
      if (camera?.worldToScreen && Vec3) {
        const wp = new Vec3(wx, wy, 0);
        const out = new Vec3();
        camera.worldToScreen(wp, out);
        const sx = cr.width / canvas.width;
        const sy = cr.height / canvas.height;
        return { x: cr.left + out.x * sx, y: cr.top + (canvas.height - out.y) * sy };
      }
      const view = ccg.view || {};
      const scaleX = view.getScaleX?.() ?? 1;
      const scaleY = view.getScaleY?.() ?? 1;
      const sx = cr.width / canvas.width;
      const sy = cr.height / canvas.height;
      return {
        x: cr.left + wx * scaleX * sx,
        y: cr.top + (canvas.height - wy) * scaleY * sy,
      };
    };

    const rectToCss = (bbox) => {
      const p1 = toClient(bbox.x, bbox.y);
      const p2 = toClient(bbox.x + bbox.width, bbox.y + bbox.height);
      const left = Math.min(p1.x, p2.x);
      const top = Math.min(p1.y, p2.y);
      return {
        left, top,
        width: Math.max(Math.abs(p2.x - p1.x), 1),
        height: Math.max(Math.abs(p2.y - p1.y), 1),
      };
    };

    const boxes = [];
    const uiBbox = ui.getBoundingBoxToWorld();
    const uiCss = rectToCss(uiBbox);
    const cw = ui.contentSize?.width ?? uiBbox.width;
    const ch = ui.contentSize?.height ?? uiBbox.height;
    boxes.push({ ...uiCss, color: '#ff2222', label: 'UITransform ' + Math.round(cw) + '×' + Math.round(ch) });

    const sp = findComp(node, /Sprite/, ccg.Sprite);
    const frame = sp?.spriteFrame;
    const rect = frame?.rect;
    const os = frame?.originalSize;
    if (rect?.width && rect?.height && os && ui.convertToWorldSpaceAR) {
      const ow = Math.round(os.width ?? cw);
      const oh = Math.round(os.height ?? ch);
      const fw = Math.round(rect.width);
      const fh = Math.round(rect.height);
      const ox = frame.offset?.x ?? 0;
      const oy = frame.offset?.y ?? 0;
      const ax = ui.anchorPoint?.x ?? 0.5;
      const ay = ui.anchorPoint?.y ?? 0.5;
      const trimX = Math.round((ow - fw) / 2 + ox);
      const trimY = Math.round((oh - fh) / 2 - oy);
      const l = -cw * ax + trimX;
      const b = -ch * ay + trimY;
      const corners = [
        { x: l, y: b },
        { x: l + fw, y: b },
        { x: l + fw, y: b + fh },
        { x: l, y: b + fh },
      ];
      const clients = corners.map((p) => {
        const w = ui.convertToWorldSpaceAR(new Vec3(p.x, p.y, 0));
        return toClient(w.x, w.y);
      });
      const xs = clients.map((p) => p.x);
      const ys = clients.map((p) => p.y);
      const inner = {
        left: Math.min(...xs),
        top: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
      boxes.push({ ...inner, color: '#00e676', label: 'frame ' + fw + '×' + fh });
    }

    const host = document.createElement('div');
    host.id = rootId;
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    for (const box of boxes) {
      const el = document.createElement('div');
      el.style.cssText = [
        'position:fixed',
        'left:' + box.left + 'px',
        'top:' + box.top + 'px',
        'width:' + box.width + 'px',
        'height:' + box.height + 'px',
        'border:4px solid ' + box.color,
        'box-shadow:0 0 0 2px #000,0 0 16px ' + box.color,
        'background:' + box.color + '33',
        'box-sizing:border-box',
      ].join(';');
      const tag = document.createElement('div');
      tag.textContent = (node.name || '') + ' · ' + box.label;
      tag.style.cssText = 'position:absolute;left:0;top:-22px;color:' + box.color + ';font:bold 13px monospace;background:rgba(0,0,0,0.75);padding:2px 6px;border-radius:3px;white-space:nowrap;';
      el.appendChild(tag);
      host.appendChild(el);
    }
    document.body.appendChild(host);

    return {
      ok: true,
      nodeName: node.name,
      nodeId: node.uuid || node._id,
      boxes,
      canvas: { left: cr.left, top: cr.top, width: cr.width, height: cr.height },
    };
  })()`;
};

const main = async () => {
  const args = parseArgs();
  await connectBridgeClientOnly(args.wsPort);
  await waitForExtension(60_000, args.wsPort);

  const expr = buildDrawExpr(args.path, args.hide);

  let result;
  try {
    result = await callBridgeAtPort(args.wsPort, 'evalPage', [expr], {
      pageUrlMatch: args.pageUrlMatch,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('未知 API')) {
      result = await callBridgeAtPort(
        args.wsPort,
        'showNodeBoundsByPath',
        [args.path],
        { pageUrlMatch: args.pageUrlMatch }
      );
      console.error('[draw-node-bounds] 扩展较旧，已回退 showNodeBoundsByPath；请重载扩展后用内联绘制');
    } else {
      throw e;
    }
  }

  console.log(JSON.stringify(result, null, 2));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
