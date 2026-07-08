/** 试玩页经 HTTP PUT 写入桥接共享目录（与换皮 in/out 通道对称） */

const DEFAULT_SHARE_HTTP_PORTS = [17374, 17375];

const sanitizeShareName = (name: string): string =>
  name.replace(/[<>:"/\\|?*\s]+/g, '_').replace(/_+/g, '_') || 'sprite.png';

/** 探测本机 share-http 基址（优先 /api/status） */
export const resolveShareHttpBase = async (
  wsPort = 17373
): Promise<string> => {
  const ports = [...new Set([...DEFAULT_SHARE_HTTP_PORTS, wsPort + 1])];
  for (const port of ports) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/status`, {
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) return `http://127.0.0.1:${port}`;
    } catch {
      /* try next */
    }
  }
  return `http://127.0.0.1:17374`;
};

/** base64 PNG → PUT out/xxx.png，WS 只传 sharePath 时用 */
export const uploadPngBase64ToShare = async (
  base64: string,
  filename: string,
  wsPort = 17373
): Promise<
  | { ok: true; sharePath: string; shareUrl: string; shareHttpBase: string }
  | { ok: false; error: string }
> => {
  const base = await resolveShareHttpBase(wsPort);
  const safeName = sanitizeShareName(filename.endsWith('.png') ? filename : `${filename}.png`);
  const sharePath = `out/${Date.now()}-${safeName}`;

  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      bytes[i] = bin.charCodeAt(i);
    }
    const res = await fetch(`${base}/${sharePath}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: bytes,
    });
    if (!res.ok) {
      return { ok: false, error: `共享目录 PUT 失败 HTTP ${res.status}` };
    }
    return {
      ok: true,
      sharePath,
      shareUrl: `${base}/${sharePath}`,
      shareHttpBase: base,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
};
