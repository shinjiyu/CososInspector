export interface PageResourceEntry {
  url: string;
  type: string;
  initiator?: string;
}

export interface PageResourceManifest {
  collectedAt: string;
  pageUrl: string;
  documentUrl: string;
  resources: PageResourceEntry[];
  wgetHints: string[];
}

function addUrl(set: Set<string>, raw: string | null | undefined): void {
  if (!raw || raw.startsWith('javascript:') || raw.startsWith('#')) return;
  try {
    const href = new URL(raw, window.location.href).href;
    if (href.startsWith('http://') || href.startsWith('https://')) {
      set.add(href);
    }
  } catch {
    /* ignore */
  }
}

/** 收集当前试玩页已加载/引用的静态资源 URL，便于整站下载 */
export function collectPageResources(): PageResourceManifest {
  const urls = new Set<string>();
  addUrl(urls, window.location.href);
  addUrl(urls, document.baseURI);

  for (const s of document.querySelectorAll('script[src]')) {
    addUrl(urls, (s as HTMLScriptElement).src);
  }
  for (const l of document.querySelectorAll('link[href]')) {
    addUrl(urls, (l as HTMLLinkElement).href);
  }
  for (const img of document.querySelectorAll('img[src]')) {
    addUrl(urls, (img as HTMLImageElement).src);
  }
  for (const source of document.querySelectorAll('source[src]')) {
    addUrl(urls, (source as HTMLSourceElement).src);
  }

  if (typeof performance !== 'undefined' && performance.getEntriesByType) {
    for (const e of performance.getEntriesByType('resource')) {
      const name = (e as PerformanceResourceTiming).name;
      if (name.startsWith('chrome-extension:')) continue;
      addUrl(urls, name);
    }
  }

  const resources: PageResourceEntry[] = [...urls].sort().map((url) => {
    let type = 'other';
    if (/\.(html?)(\?|$)/i.test(url)) type = 'document';
    else if (/\.js(\?|$)/i.test(url)) type = 'script';
    else if (/\.css(\?|$)/i.test(url)) type = 'stylesheet';
    else if (/\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(url)) type = 'image';
    else if (/\.(json|plist|atlas|bin|wasm)(\?|$)/i.test(url)) type = 'data';
    return { url, type };
  });

  const origin = location.origin;
  const wgetHints = [
    `# 在本地目录执行（需安装 wget 或 curl）`,
    `wget -p -k -E -H "${window.location.href}"`,
    `# 或仅下载资源列表中的文件（见 page-resources.json）`,
    ...resources
      .filter((r) => r.url !== window.location.href)
      .slice(0, 30)
      .map((r) => `curl -L -O "${r.url}"`),
    resources.length > 31 ? `# … 另有 ${resources.length - 31} 个 URL，见 page-resources.json` : '',
  ].filter(Boolean);

  return {
    collectedAt: new Date().toISOString(),
    pageUrl: window.location.href,
    documentUrl: document.URL,
    resources,
    wgetHints,
  };
}
