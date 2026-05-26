/**
 * super-html：部分 native 纹理不在 __res，而是 zip 内独立文件（内容为 data:image/...;base64,...）
 * 例：assets/main/native/c1/c1845490-….jpg（仅 zip 条目，__res 无对应键）
 */

/**
 * @param {import('jszip')} zip
 * @param {object} rep manifest replacement
 * @param {string} pageUrl
 * @param {(url: string, pageUrl: string) => string | null} assetUrlToZipPath
 */
export function collectZipInlineImagePaths(zip, rep, pageUrl, assetUrlToZipPath) {
  const paths = new Set();

  for (const url of rep.original?.assetUrls ?? []) {
    const zp = assetUrlToZipPath(url, pageUrl);
    if (zp && zip.file(zp) && !zp.endsWith('/')) paths.add(zp);
  }

  const stem = String(rep.original?.textureUuid || '').split('@')[0]?.trim();
  if (stem.length >= 8) {
    for (const name of Object.keys(zip.files)) {
      if (name.endsWith('/')) continue;
      if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
      if (name.includes(stem)) paths.add(name);
    }
  }

  for (const mk of rep.matchKeys ?? []) {
    if (mk.length < 12 || !mk.includes('native/')) continue;
    const zp = mk.replace(/^\/+/, '').replace(/^h5domino\/superplay\//, '');
    if (zip.file(zp)) paths.add(zp);
  }

  return [...paths];
}

/** @param {import('jszip')} zip @param {string} path */
export async function readZipInlineDataUrl(zip, path) {
  const f = zip.file(path);
  if (!f) return null;
  const s = (await f.async('string')).trim();
  return /^data:image\//i.test(s) ? s : null;
}

/**
 * @param {import('jszip')} zip
 * @param {object} rep
 * @param {string} imagePath
 * @param {(imagePath: string, resKey: string, originalValue: string, rep: object) => Promise<string>} encodeForResKey
 * @param {{ pageUrl: string; dryRun?: boolean; assetUrlToZipPath: Function }} opts
 */
export async function patchZipInlineImages(zip, rep, imagePath, encodeForResKey, opts) {
  const paths = collectZipInlineImagePaths(
    zip,
    rep,
    opts.pageUrl,
    opts.assetUrlToZipPath
  );
  const patched = [];

  for (const path of paths) {
    const original = await readZipInlineDataUrl(zip, path);
    if (!original) continue;

    const dataUrl = await encodeForResKey(
      imagePath,
      path,
      original,
      rep
    );

    if (!opts.dryRun) {
      zip.file(path, dataUrl);
    }

    patched.push({ path, dataUrl, originalLen: original.length });
  }

  return patched;
}
