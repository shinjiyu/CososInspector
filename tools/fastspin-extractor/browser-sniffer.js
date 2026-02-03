/**
 * FastSpin 浏览器端资源嗅探器
 *
 * 使用方法：
 * 1. 打开 FastSpin 游戏页面
 * 2. 打开浏览器开发者工具 (F12)
 * 3. 在 Console 中粘贴此脚本并执行
 * 4. 刷新页面或等待游戏加载
 * 5. 执行 window.fsExtractor.export() 导出资源
 */

(function () {
  "use strict";

  // 避免重复注入
  if (window.fsExtractor) {
    console.log(
      "[FastSpin Extractor] Already injected. Use window.fsExtractor.export() to export resources."
    );
    return;
  }

  const fsExtractor = {
    version: "1.0.0",
    resources: [],
    resourceMap: new Map(),
    startTime: Date.now(),

    // 资源分类
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

    /**
     * 初始化监控
     */
    init() {
      this.hookFetch();
      this.hookXHR();
      this.hookImage();
      this.hookAudio();
      console.log(
        "[FastSpin Extractor] Initialized. Monitoring network requests..."
      );
      console.log("[FastSpin Extractor] Commands:");
      console.log(
        "  - window.fsExtractor.export()      : Export all resources"
      );
      console.log("  - window.fsExtractor.summary()     : Show summary");
      console.log(
        "  - window.fsExtractor.download(url) : Download specific resource"
      );
      console.log(
        "  - window.fsExtractor.downloadAll() : Download all resources"
      );
    },

    /**
     * Hook Fetch API
     */
    hookFetch() {
      const originalFetch = window.fetch;
      const self = this;

      window.fetch = async function (input, init) {
        const url = typeof input === "string" ? input : input.url;
        const response = await originalFetch.apply(this, arguments);

        // 克隆响应以便分析
        const clone = response.clone();
        self.processResource(url, clone);

        return response;
      };
    },

    /**
     * Hook XMLHttpRequest
     */
    hookXHR() {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      const self = this;

      XMLHttpRequest.prototype.open = function (method, url) {
        this._fsUrl = url;
        this._fsMethod = method;
        return originalOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function () {
        const xhr = this;
        const url = this._fsUrl;

        xhr.addEventListener("load", function () {
          if (xhr.status === 200) {
            self.processXHRResource(url, xhr);
          }
        });

        return originalSend.apply(this, arguments);
      };
    },

    /**
     * Hook Image 加载
     */
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
            self.addResource(value, "texture", { type: "image" });
            return originalSrcSetter.call(this, value);
          },
          get() {
            return this.getAttribute("src");
          },
        });

        return img;
      };
    },

    /**
     * Hook Audio 加载
     */
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

    /**
     * 处理 Fetch 响应
     */
    async processResource(url, response) {
      const contentType = response.headers.get("content-type") || "";
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
      } else {
        this.addResource(url, "other");
      }
    },

    /**
     * 处理 XHR 响应
     */
    processXHRResource(url, xhr) {
      const contentType = xhr.getResponseHeader("content-type") || "";
      const ext = this.getExtension(url);

      if (ext === "json") {
        try {
          const data = JSON.parse(xhr.responseText);
          this.classifyJson(url, data);
        } catch (e) {
          this.addResource(url, "other");
        }
      } else {
        this.processResource(url, {
          headers: { get: (name) => xhr.getResponseHeader(name) },
        });
      }
    },

    /**
     * 分类 JSON 资源
     */
    classifyJson(url, data) {
      // Spine 骨骼数据
      if (data.skeleton && data.bones && data.slots) {
        this.addResource(url, "spine_skeleton", {
          spineVersion: data.skeleton.spine,
          animations: Object.keys(data.animations || {}),
          bones: data.bones.length,
          slots: data.slots.length,
        });
        return;
      }

      // TexturePacker 精灵图
      if (data.frames && data.meta) {
        const spriteNames = Object.keys(data.frames);
        this.addResource(url, "sprite_sheet", {
          spriteCount: spriteNames.length,
          textureFile: data.meta.image,
          size: data.meta.size,
          format: data.meta.format,
        });
        return;
      }

      // Lottie 动画
      if (data.v && data.fr && data.layers) {
        this.addResource(url, "lottie", {
          lottieVersion: data.v,
          frameRate: data.fr,
          duration: (data.op - data.ip) / data.fr,
          name: data.nm,
        });
        return;
      }

      // 语言包
      if (url.includes("zh_CN") || url.includes("en_US")) {
        this.addResource(url, "locale", {
          keyCount: Object.keys(data).length,
        });
        return;
      }

      // 其他配置
      this.addResource(url, "config");
    },

    /**
     * 添加资源到列表
     */
    addResource(url, category, metadata = {}) {
      // 规范化 URL
      const normalizedUrl = this.normalizeUrl(url);

      // 避免重复
      if (this.resourceMap.has(normalizedUrl)) {
        return;
      }

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

      console.log(`[${category}] ${resource.filename}`);
    },

    /**
     * 辅助函数
     */
    normalizeUrl(url) {
      try {
        const u = new URL(url, window.location.href);
        return u.href;
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

    /**
     * 显示摘要
     */
    summary() {
      console.log("\n========================================");
      console.log("FastSpin Resource Summary");
      console.log("========================================");

      for (const [category, items] of Object.entries(this.categories)) {
        if (items.length > 0) {
          console.log(`${category}: ${items.length} files`);
        }
      }

      console.log(`\nTotal: ${this.resources.length} resources`);
      console.log("========================================\n");

      return this.categories;
    },

    /**
     * 导出资源列表
     */
    export(format = "json") {
      const data = {
        exportTime: new Date().toISOString(),
        pageUrl: window.location.href,
        totalResources: this.resources.length,
        categories: {},
        resources: this.resources,
      };

      for (const [category, items] of Object.entries(this.categories)) {
        data.categories[category] = items.length;
      }

      if (format === "json") {
        // 下载 JSON 文件
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fastspin_resources_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        console.log("Resources exported to JSON file");
      } else if (format === "urls") {
        // 导出 URL 列表
        const urls = this.resources.map((r) => r.url).join("\n");
        const blob = new Blob([urls], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fastspin_urls_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        console.log("URL list exported");
      } else if (format === "console") {
        console.log(JSON.stringify(data, null, 2));
      }

      return data;
    },

    /**
     * 下载单个资源
     */
    async download(url) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const filename = this.getFilename(url);

        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);

        console.log(`Downloaded: ${filename}`);
      } catch (e) {
        console.error(`Failed to download ${url}:`, e);
      }
    },

    /**
     * 批量下载所有资源
     */
    async downloadAll(delay = 500) {
      console.log(`Starting download of ${this.resources.length} resources...`);
      console.log(
        "Note: Browser may block multiple downloads. Check your download settings."
      );

      for (let i = 0; i < this.resources.length; i++) {
        const resource = this.resources[i];
        console.log(`[${i + 1}/${this.resources.length}] ${resource.filename}`);
        await this.download(resource.url);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      console.log("Download complete!");
    },

    /**
     * 生成下载脚本
     */
    generateDownloadScript() {
      const script = `
#!/bin/bash
# FastSpin Resource Download Script
# Generated: ${new Date().toISOString()}
# Total files: ${this.resources.length}

mkdir -p fastspin_assets/{spine,lottie,sprites,textures,audio,fonts,locales,configs,other}

${this.resources
  .map((r) => {
    const dir = r.category
      .replace("spine_skeleton", "spine")
      .replace("spine_atlas", "spine")
      .replace("sprite_sheet", "sprites")
      .replace("texture", "textures");
    return `curl -o "fastspin_assets/${dir}/${r.filename}" "${r.url}"`;
  })
  .join("\n")}

echo "Download complete!"
`;
      const blob = new Blob([script], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "download_resources.sh";
      a.click();
      URL.revokeObjectURL(url);

      console.log("Download script generated: download_resources.sh");
      return script;
    },

    /**
     * 解包精灵图
     */
    async unpackSpriteSheet(spriteResource) {
      if (spriteResource.category !== "sprite_sheet") {
        console.error("Not a sprite sheet resource");
        return;
      }

      const response = await fetch(spriteResource.url);
      const data = await response.json();

      // 获取纹理图片
      const textureUrl = spriteResource.url.replace(/[^/]+$/, data.meta.image);

      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const sprites = [];

          for (const [name, frameData] of Object.entries(data.frames)) {
            const { frame, rotated, spriteSourceSize, sourceSize } = frameData;

            const canvas = document.createElement("canvas");
            canvas.width = sourceSize.w;
            canvas.height = sourceSize.h;
            const ctx = canvas.getContext("2d");

            if (rotated) {
              ctx.save();
              ctx.translate(spriteSourceSize.x + frame.h, spriteSourceSize.y);
              ctx.rotate(Math.PI / 2);
              ctx.drawImage(
                img,
                frame.x,
                frame.y,
                frame.w,
                frame.h,
                0,
                0,
                frame.w,
                frame.h
              );
              ctx.restore();
            } else {
              ctx.drawImage(
                img,
                frame.x,
                frame.y,
                frame.w,
                frame.h,
                spriteSourceSize.x,
                spriteSourceSize.y,
                frame.w,
                frame.h
              );
            }

            sprites.push({
              name: name,
              dataUrl: canvas.toDataURL("image/png"),
              width: sourceSize.w,
              height: sourceSize.h,
            });
          }

          console.log(
            `Unpacked ${sprites.length} sprites from ${spriteResource.filename}`
          );
          resolve(sprites);
        };
        img.src = textureUrl;
      });
    },
  };

  // 初始化
  fsExtractor.init();
  window.fsExtractor = fsExtractor;
})();
