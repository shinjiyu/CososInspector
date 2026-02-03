// ==UserScript==
// @name         FastSpin Resource Extractor
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  从 FastSpin H5 游戏中提取资源
// @author       CocosInspector
// @match        *://go.fastspindemo.com/*
// @match        *://*.fastspindemo.com/*
// @match        *://contents.fastspindemo.com/*
// @grant        GM_download
// @grant        GM_setClipboard
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  // 避免重复注入
  if (window.fsExtractor) return;

  const fsExtractor = {
    version: "1.0.0",
    resources: [],
    resourceMap: new Map(),
    startTime: Date.now(),

    categories: {
      spine_skeleton: [],
      spine_atlas: [],
      lottie: [],
      sprite_sheet: [],
      texture: [],
      audio: [],
      font: [],
      locale: [],
      config: [],
      other: [],
    },

    init() {
      this.hookFetch();
      this.hookXHR();
      this.hookImage();
      this.hookAudio();
      this.createUI();
      console.log(
        "%c[FastSpin Extractor] v" + this.version + " - 已启动",
        "color: #4CAF50; font-weight: bold;"
      );
    },

    hookFetch() {
      const originalFetch = window.fetch;
      const self = this;

      window.fetch = async function (input, init) {
        const url = typeof input === "string" ? input : input.url;
        const response = await originalFetch.apply(this, arguments);
        const clone = response.clone();
        self.processResource(url, clone);
        return response;
      };
    },

    hookXHR() {
      const originalOpen = XMLHttpRequest.prototype.open;
      const self = this;

      XMLHttpRequest.prototype.open = function (method, url) {
        this._fsUrl = url;
        this.addEventListener("load", function () {
          if (this.status === 200) {
            self.processXHRResource(url, this);
          }
        });
        return originalOpen.apply(this, arguments);
      };
    },

    hookImage() {
      const self = this;
      const originalImage = window.Image;

      window.Image = function (width, height) {
        const img = new originalImage(width, height);
        const originalSrcSetter = Object.getOwnPropertyDescriptor(
          HTMLImageElement.prototype,
          "src"
        ).set;

        Object.defineProperty(img, "src", {
          set(value) {
            if (value && typeof value === "string") {
              self.addResource(value, "texture", { type: "image" });
            }
            return originalSrcSetter.call(this, value);
          },
          get() {
            return this.getAttribute("src");
          },
        });
        return img;
      };
    },

    hookAudio() {
      const self = this;
      const originalAudio = window.Audio;

      window.Audio = function (src) {
        const audio = new originalAudio(src);
        if (src) {
          self.addResource(src, "audio", { type: "audio" });
        }
        return audio;
      };
    },

    async processResource(url, response) {
      const ext = this.getExtension(url);

      if (ext === "json") {
        try {
          const data = await response.json();
          this.classifyJson(url, data);
        } catch (e) {
          this.addResource(url, "other");
        }
      } else if (ext === "atlas") {
        this.addResource(url, "spine_atlas");
      } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
        this.addResource(url, "texture");
      } else if (["mp3", "ogg", "wav", "m4a"].includes(ext)) {
        this.addResource(url, "audio");
      } else if (["ttf", "otf", "woff", "woff2"].includes(ext)) {
        this.addResource(url, "font");
      } else if (ext === "xml") {
        this.addResource(url, "font", { subtype: "bitmap" });
      }
    },

    processXHRResource(url, xhr) {
      const ext = this.getExtension(url);

      if (ext === "json") {
        try {
          const data = JSON.parse(xhr.responseText);
          this.classifyJson(url, data);
        } catch (e) {
          this.addResource(url, "other");
        }
      } else {
        this.processResource(url, { json: () => Promise.reject() });
      }
    },

    classifyJson(url, data) {
      if (data.skeleton && data.bones && data.slots) {
        this.addResource(url, "spine_skeleton", {
          spineVersion: data.skeleton.spine,
          animations: Object.keys(data.animations || {}).length,
        });
      } else if (data.frames && data.meta) {
        this.addResource(url, "sprite_sheet", {
          spriteCount: Object.keys(data.frames).length,
          textureFile: data.meta.image,
        });
      } else if (data.v && data.fr && data.layers) {
        this.addResource(url, "lottie", {
          lottieVersion: data.v,
          name: data.nm,
        });
      } else if (url.includes("zh_CN") || url.includes("en_US")) {
        this.addResource(url, "locale");
      } else {
        this.addResource(url, "config");
      }
    },

    addResource(url, category, metadata = {}) {
      const normalizedUrl = this.normalizeUrl(url);
      if (this.resourceMap.has(normalizedUrl)) return;

      const resource = {
        url: normalizedUrl,
        category: category,
        filename: this.getFilename(normalizedUrl),
        extension: this.getExtension(normalizedUrl),
        timestamp: Date.now() - this.startTime,
        ...metadata,
      };

      this.resources.push(resource);
      this.resourceMap.set(normalizedUrl, resource);
      this.categories[category].push(resource);
      this.updateUI();
    },

    normalizeUrl(url) {
      try {
        return new URL(url, window.location.href).href;
      } catch (e) {
        return url;
      }
    },

    getFilename(url) {
      return url.split("/").pop().split("?")[0];
    },

    getExtension(url) {
      return this.getFilename(url).split(".").pop().toLowerCase();
    },

    // ========== UI 相关 ==========
    createUI() {
      const panel = document.createElement("div");
      panel.id = "fs-extractor-panel";
      panel.innerHTML = `
                <style>
                    #fs-extractor-panel {
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        width: 280px;
                        background: rgba(0, 0, 0, 0.9);
                        color: #fff;
                        font-family: monospace;
                        font-size: 12px;
                        border-radius: 8px;
                        z-index: 999999;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
                        overflow: hidden;
                    }
                    #fs-extractor-panel.minimized .fs-body { display: none; }
                    .fs-header {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        padding: 10px 12px;
                        cursor: move;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    }
                    .fs-header h3 {
                        margin: 0;
                        font-size: 13px;
                        font-weight: bold;
                    }
                    .fs-header button {
                        background: rgba(255,255,255,0.2);
                        border: none;
                        color: #fff;
                        width: 24px;
                        height: 24px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    }
                    .fs-header button:hover { background: rgba(255,255,255,0.3); }
                    .fs-body { padding: 12px; }
                    .fs-stats {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 6px;
                        margin-bottom: 12px;
                    }
                    .fs-stat {
                        background: rgba(255,255,255,0.1);
                        padding: 6px 8px;
                        border-radius: 4px;
                        display: flex;
                        justify-content: space-between;
                    }
                    .fs-stat-value { color: #4CAF50; font-weight: bold; }
                    .fs-buttons {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 8px;
                    }
                    .fs-btn {
                        background: #4CAF50;
                        border: none;
                        color: #fff;
                        padding: 8px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 11px;
                        transition: all 0.2s;
                    }
                    .fs-btn:hover { background: #45a049; transform: scale(1.02); }
                    .fs-btn.secondary { background: #2196F3; }
                    .fs-btn.secondary:hover { background: #1976D2; }
                    .fs-total {
                        text-align: center;
                        padding: 8px;
                        background: rgba(76, 175, 80, 0.2);
                        border-radius: 4px;
                        margin-bottom: 12px;
                    }
                    .fs-total-num { font-size: 24px; color: #4CAF50; font-weight: bold; }
                </style>
                <div class="fs-header">
                    <h3>🎰 FastSpin Extractor</h3>
                    <div>
                        <button id="fs-minimize">−</button>
                    </div>
                </div>
                <div class="fs-body">
                    <div class="fs-total">
                        <div class="fs-total-num" id="fs-total">0</div>
                        <div>资源已捕获</div>
                    </div>
                    <div class="fs-stats" id="fs-stats"></div>
                    <div class="fs-buttons">
                        <button class="fs-btn" id="fs-export-json">导出 JSON</button>
                        <button class="fs-btn secondary" id="fs-export-urls">导出 URLs</button>
                        <button class="fs-btn" id="fs-export-script">下载脚本</button>
                        <button class="fs-btn secondary" id="fs-copy-urls">复制 URLs</button>
                    </div>
                </div>
            `;

      document.body.appendChild(panel);

      // 事件绑定
      document.getElementById("fs-minimize").onclick = () => {
        panel.classList.toggle("minimized");
        document.getElementById("fs-minimize").textContent =
          panel.classList.contains("minimized") ? "+" : "−";
      };

      document.getElementById("fs-export-json").onclick = () =>
        this.export("json");
      document.getElementById("fs-export-urls").onclick = () =>
        this.export("urls");
      document.getElementById("fs-export-script").onclick = () =>
        this.generateDownloadScript();
      document.getElementById("fs-copy-urls").onclick = () => this.copyUrls();

      // 拖动功能
      this.makeDraggable(panel);
    },

    makeDraggable(el) {
      const header = el.querySelector(".fs-header");
      let isDragging = false,
        offsetX,
        offsetY;

      header.onmousedown = (e) => {
        isDragging = true;
        offsetX = e.clientX - el.offsetLeft;
        offsetY = e.clientY - el.offsetTop;
      };

      document.onmousemove = (e) => {
        if (isDragging) {
          el.style.left = e.clientX - offsetX + "px";
          el.style.top = e.clientY - offsetY + "px";
          el.style.right = "auto";
        }
      };

      document.onmouseup = () => (isDragging = false);
    },

    updateUI() {
      const statsEl = document.getElementById("fs-stats");
      const totalEl = document.getElementById("fs-total");
      if (!statsEl) return;

      totalEl.textContent = this.resources.length;

      const display = {
        Spine: this.categories.spine_skeleton.length,
        Atlas: this.categories.spine_atlas.length,
        Sprite: this.categories.sprite_sheet.length,
        Texture: this.categories.texture.length,
        Audio: this.categories.audio.length,
        Lottie: this.categories.lottie.length,
      };

      statsEl.innerHTML = Object.entries(display)
        .map(
          ([k, v]) =>
            `<div class="fs-stat"><span>${k}</span><span class="fs-stat-value">${v}</span></div>`
        )
        .join("");
    },

    // ========== 导出功能 ==========
    export(format) {
      const data = {
        exportTime: new Date().toISOString(),
        pageUrl: window.location.href,
        totalResources: this.resources.length,
        resources: this.resources,
      };

      const filename = `fastspin_${format}_${Date.now()}`;

      if (format === "json") {
        this.downloadText(
          JSON.stringify(data, null, 2),
          filename + ".json",
          "application/json"
        );
      } else if (format === "urls") {
        const urls = this.resources.map((r) => r.url).join("\n");
        this.downloadText(urls, filename + ".txt", "text/plain");
      }
    },

    downloadText(content, filename, type) {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },

    copyUrls() {
      const urls = this.resources.map((r) => r.url).join("\n");
      navigator.clipboard.writeText(urls).then(() => {
        alert(`已复制 ${this.resources.length} 个 URL 到剪贴板`);
      });
    },

    generateDownloadScript() {
      const script = `#!/bin/bash
# FastSpin Resource Download Script
# Generated: ${new Date().toISOString()}
# Total: ${this.resources.length} files

mkdir -p fastspin/{spine,lottie,sprites,textures,audio,fonts,locales,configs}

${this.resources
  .map((r) => {
    let dir = r.category
      .replace("spine_skeleton", "spine")
      .replace("spine_atlas", "spine")
      .replace("sprite_sheet", "sprites")
      .replace("texture", "textures");
    return `curl -o "fastspin/${dir}/${r.filename}" "${r.url}"`;
  })
  .join("\n")}

echo "Done!"`;

      this.downloadText(script, "download_fastspin.sh", "text/plain");
    },

    summary() {
      console.table(
        Object.entries(this.categories).map(([k, v]) => ({
          Category: k,
          Count: v.length,
        }))
      );
      return this.categories;
    },
  };

  // 等待 DOM 加载完成后初始化 UI
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => fsExtractor.createUI());
  }

  // 立即开始 Hook (在 document-start 阶段)
  fsExtractor.hookFetch();
  fsExtractor.hookXHR();

  // DOM ready 后完成初始化
  const initFull = () => {
    fsExtractor.hookImage();
    fsExtractor.hookAudio();
    if (!document.getElementById("fs-extractor-panel")) {
      fsExtractor.createUI();
    }
    console.log(
      "%c[FastSpin Extractor] v" + fsExtractor.version + " - 已启动",
      "color: #4CAF50; font-weight: bold;"
    );
  };

  if (document.readyState === "complete") {
    initFull();
  } else {
    window.addEventListener("load", initFull);
  }

  window.fsExtractor = fsExtractor;
})();
