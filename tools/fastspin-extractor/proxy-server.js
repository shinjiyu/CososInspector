/**
 * FastSpin 资源提取代理服务器 v2
 *
 * 用法：
 *   node proxy-server.js
 *   然后访问 http://localhost:3000
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

const PORT = 3000;

// 注入的 hook 脚本
const injectionScript = `
<script>
(function() {
    if (window.__fsHooked) return;
    window.__fsHooked = true;
    
    window.__fsResources = [];
    window.__fsResourceMap = new Map();
    
    const addResource = (url, type, meta = {}) => {
        if (!url || window.__fsResourceMap.has(url)) return;
        // 规范化 URL
        try {
            url = new URL(url, window.location.href).href;
        } catch(e) {}
        if (window.__fsResourceMap.has(url)) return;
        
        const res = { url, type, filename: url.split('/').pop().split('?')[0], ...meta, time: Date.now() };
        window.__fsResources.push(res);
        window.__fsResourceMap.set(url, res);
        console.log('[FS ' + type + ']', res.filename);
    };

    // Hook Fetch
    const origFetch = window.fetch;
    window.fetch = async function(input, init) {
        const url = typeof input === 'string' ? input : (input?.url || String(input));
        
        try {
            const resp = await origFetch.apply(this, arguments);
            const clone = resp.clone();
            const ext = url.split('/').pop().split('?')[0].split('.').pop().toLowerCase();
            
            if (ext === 'json') {
                try {
                    const data = await clone.json();
                    if (data.skeleton && data.bones) {
                        addResource(url, 'spine', { version: data.skeleton.spine });
                    } else if (data.frames && data.meta) {
                        addResource(url, 'sprite', { count: Object.keys(data.frames).length, texture: data.meta.image });
                    } else if (data.v && data.fr && data.layers) {
                        addResource(url, 'lottie', { version: data.v });
                    } else if (url.includes('zh_CN') || url.includes('en_US')) {
                        addResource(url, 'locale');
                    } else {
                        addResource(url, 'config');
                    }
                } catch(e) { addResource(url, 'config'); }
            } else if (ext === 'atlas') {
                addResource(url, 'atlas');
            } else if (['png','jpg','jpeg','webp','gif'].includes(ext)) {
                addResource(url, 'texture');
            } else if (['mp3','ogg','wav','m4a'].includes(ext)) {
                addResource(url, 'audio');
            } else if (['ttf','otf','woff','woff2'].includes(ext)) {
                addResource(url, 'font');
            } else if (ext === 'xml') {
                addResource(url, 'font');
            } else if (ext === 'css') {
                addResource(url, 'css');
            } else if (ext === 'js') {
                addResource(url, 'js');
            }
            return resp;
        } catch(e) {
            throw e;
        }
    };

    // Hook XHR
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this.__url = url;
        this.__method = method;
        return origOpen.apply(this, [method, url, ...rest]);
    };
    
    XMLHttpRequest.prototype.send = function(body) {
        const xhr = this;
        xhr.addEventListener('load', function() {
            if (xhr.status === 200 && xhr.__url) {
                const url = xhr.__url;
                const ext = url.split('/').pop().split('?')[0].split('.').pop().toLowerCase();
                
                if (ext === 'json') {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        if (data.skeleton && data.bones) {
                            addResource(url, 'spine', { version: data.skeleton.spine });
                        } else if (data.frames && data.meta) {
                            addResource(url, 'sprite', { count: Object.keys(data.frames).length, texture: data.meta.image });
                        } else if (data.v && data.fr && data.layers) {
                            addResource(url, 'lottie', { version: data.v });
                        } else if (url.includes('zh_CN') || url.includes('en_US')) {
                            addResource(url, 'locale');
                        } else {
                            addResource(url, 'config');
                        }
                    } catch(e) { addResource(url, 'config'); }
                } else if (ext === 'atlas') {
                    addResource(url, 'atlas');
                } else if (['png','jpg','jpeg','webp','gif'].includes(ext)) {
                    addResource(url, 'texture');
                } else if (['mp3','ogg','wav','m4a'].includes(ext)) {
                    addResource(url, 'audio');
                }
            }
        });
        return origSend.apply(this, arguments);
    };

    // Hook Image
    const OrigImg = window.Image;
    window.Image = function(w, h) {
        const img = new OrigImg(w, h);
        try {
            const origSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src').set;
            Object.defineProperty(img, 'src', {
                set(v) { if (v) addResource(v, 'texture'); return origSrc.call(this, v); },
                get() { return this.getAttribute('src'); }
            });
        } catch(e) {}
        return img;
    };

    // Hook Audio  
    const OrigAudio = window.Audio;
    window.Audio = function(src) {
        if (src) addResource(src, 'audio');
        return new OrigAudio(src);
    };

    // 导出函数
    window.fsExport = () => {
        const data = {
            time: new Date().toISOString(),
            count: window.__fsResources.length,
            resources: window.__fsResources
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'fastspin_' + Date.now() + '.json';
        a.click();
        console.log('Exported', data.count, 'resources');
        return data;
    };

    window.fsSummary = () => {
        const byType = {};
        window.__fsResources.forEach(r => {
            byType[r.type] = (byType[r.type] || 0) + 1;
        });
        console.table(byType);
        console.log('Total:', window.__fsResources.length);
        return byType;
    };

    window.fsURLs = () => window.__fsResources.map(r => r.url);
    window.fsList = () => window.__fsResources;

    console.log('%c[FastSpin Extractor] Hooks installed!', 'color: #4CAF50; font-weight: bold;');
    console.log('Commands: fsSummary(), fsExport(), fsURLs(), fsList()');
})();
</script>
`;

// 主页 HTML
const indexHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>FastSpin Extractor</title>
    <style>
        body { font-family: system-ui; max-width: 900px; margin: 50px auto; padding: 20px; background: #1a1a2e; color: #fff; }
        h1 { color: #4CAF50; }
        .card { background: #16213e; padding: 20px; border-radius: 8px; margin: 20px 0; }
        input { width: 100%; padding: 12px; margin: 10px 0; border: none; border-radius: 4px; font-size: 14px; box-sizing: border-box; }
        button { padding: 12px 24px; background: #4CAF50; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; margin-right: 10px; }
        button:hover { background: #45a049; }
        button.secondary { background: #2196F3; }
        code { background: #0d1117; padding: 2px 6px; border-radius: 3px; }
        pre { background: #0d1117; padding: 15px; border-radius: 6px; overflow-x: auto; }
        .note { background: #ff9800; color: #000; padding: 10px; border-radius: 4px; margin: 10px 0; }
        a { color: #4CAF50; }
    </style>
</head>
<body>
    <h1>🎰 FastSpin Resource Extractor</h1>
    
    <div class="note">
        <strong>注意：</strong> 由于跨域限制，代理方式可能无法工作。推荐使用下面的 <strong>方法 2</strong>。
    </div>
    
    <div class="card">
        <h3>方法 1: 代理模式 (可能有跨域问题)</h3>
        <input type="text" id="url" placeholder="游戏 URL" 
               value="https://go.fastspindemo.com/touch/fsnew/20240901P/games/fortunejewels2/index.jsp?game=S-FJ02&language=zh_CN&type=web&menumode=off&pm=3">
        <button onclick="openProxy()">通过代理打开</button>
    </div>
    
    <div class="card">
        <h3>方法 2: 直接注入 (推荐) ✨</h3>
        <p>1. 直接访问游戏页面: <a href="https://go.fastspindemo.com/touch/fsnew/20240901P/games/fortunejewels2/index.jsp?game=S-FJ02&language=zh_CN&type=web&menumode=off&pm=3" target="_blank">打开游戏</a></p>
        <p>2. 打开 DevTools (F12) → Console</p>
        <p>3. 粘贴并运行以下代码（页面加载完成后）:</p>
        <button onclick="copyScript()">📋 复制注入脚本</button>
        <button class="secondary" onclick="showScript()">👁 查看脚本</button>
        <pre id="scriptPre" style="display:none; max-height: 300px; overflow: auto;"></pre>
    </div>
    
    <div class="card">
        <h3>方法 3: 使用 Network 面板</h3>
        <p>最简单的方法 - 不需要任何脚本:</p>
        <ol>
            <li>打开游戏页面</li>
            <li>F12 打开 DevTools → Network 标签</li>
            <li>刷新页面</li>
            <li>等待加载完成</li>
            <li>右键任意请求 → <strong>Save all as HAR with content</strong></li>
        </ol>
    </div>
    
    <div class="card">
        <h3>控制台命令</h3>
        <pre>fsSummary()   // 显示资源统计
fsExport()    // 导出 JSON 文件  
fsURLs()      // 获取所有 URL
fsList()      // 获取完整资源列表</pre>
    </div>
    
    <script>
        const injectScript = \`${injectionScript
          .replace(/<\/?script>/g, "")
          .trim()}\`;
        
        function openProxy() {
            const url = document.getElementById('url').value;
            window.open('/proxy/' + encodeURIComponent(url), '_blank');
        }
        
        function copyScript() {
            navigator.clipboard.writeText(injectScript).then(() => {
                alert('脚本已复制到剪贴板！\\n\\n请在游戏页面的 Console 中粘贴运行。');
            });
        }
        
        function showScript() {
            const pre = document.getElementById('scriptPre');
            if (pre.style.display === 'none') {
                pre.textContent = injectScript;
                pre.style.display = 'block';
            } else {
                pre.style.display = 'none';
            }
        }
    </script>
</body>
</html>
`;

// 代理请求函数
function proxyRequest(targetUrl, req, res) {
  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("Invalid URL: " + targetUrl);
    return;
  }

  const protocol = parsedUrl.protocol === "https:" ? https : http;

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: req.method,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: req.headers.accept || "*/*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Accept-Encoding": "identity", // 不要压缩，方便修改
      Referer: parsedUrl.origin + "/",
      Origin: parsedUrl.origin,
    },
  };

  console.log(`  -> Proxying to: ${parsedUrl.href}`);

  const proxyReq = protocol.request(options, (proxyRes) => {
    let chunks = [];

    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", () => {
      let body = Buffer.concat(chunks);
      const contentType = proxyRes.headers["content-type"] || "";

      // 如果是 HTML，注入脚本
      if (contentType.includes("text/html")) {
        let html = body.toString("utf-8");

        // 注入脚本到 <head>
        if (html.includes("<head>")) {
          html = html.replace("<head>", "<head>" + injectionScript);
        } else if (html.includes("<HEAD>")) {
          html = html.replace("<HEAD>", "<HEAD>" + injectionScript);
        } else {
          html = injectionScript + html;
        }

        body = Buffer.from(html, "utf-8");
      }

      // 构建响应头
      const headers = {
        "Content-Type": contentType,
        "Content-Length": body.length,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Cache-Control": "no-cache",
      };

      res.writeHead(proxyRes.statusCode, headers);
      res.end(body);
    });
  });

  proxyReq.on("error", (e) => {
    console.error("  Proxy error:", e.message);
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Proxy error: " + e.message);
  });

  // 转发请求体
  req.pipe(proxyReq);
}

// 创建服务器
const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = reqUrl.pathname;

  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${pathname}`);

  // CORS 预检
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    });
    res.end();
    return;
  }

  // 主页
  if (pathname === "/" || pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(indexHTML);
    return;
  }

  // 代理路由: /proxy/编码后的URL
  if (pathname.startsWith("/proxy/")) {
    const encodedUrl = pathname.slice(7); // 移除 '/proxy/'
    const targetUrl = decodeURIComponent(encodedUrl);
    proxyRequest(targetUrl, req, res);
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found: " + pathname);
});

server.listen(PORT, () => {
  console.log("");
  console.log("========================================");
  console.log("  FastSpin Resource Extractor");
  console.log("========================================");
  console.log("");
  console.log(`  Open: http://localhost:${PORT}`);
  console.log("");
  console.log("========================================");
  console.log("");
});
