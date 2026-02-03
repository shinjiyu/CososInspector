/**
 * FastSpin 浏览器端资源嗅探器 - 调试版本
 * 添加了详细日志来诊断为什么只有 audio 资源能被捕获
 */

(function () {
  "use strict";

  // 调试日志收集
  const debugLogs = [];
  const logDebug = (hypothesisId, location, message, data) => {
    const entry = {
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    };
    debugLogs.push(entry);
    console.log(`[DEBUG-${hypothesisId}] ${location}: ${message}`, data || "");
  };

  // 避免重复注入
  if (window.fsExtractor) {
    console.log("[FastSpin Extractor] Already injected.");
    return;
  }

  // #region agent log - Hook 时机检测
  logDebug("A", "init:start", "脚本开始执行", {
    readyState: document.readyState,
    time: new Date().toISOString(),
  });
  // #endregion

  const fsExtractor = {
    version: "1.0.0-debug",
    resources: [],
    resourceMap: new Map(),
    startTime: Date.now(),
    debugLogs: debugLogs,

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
      // #region agent log - Hook 顺序记录
      logDebug("A", "init", "开始初始化 hooks", {
        time: Date.now() - this.startTime,
      });
      // #endregion

      this.hookFetch();
      this.hookXHR();
      this.hookImage();
      this.hookAudio();

      // #region agent log - Hook 完成
      logDebug("A", "init:done", "所有 hooks 已安装", {
        elapsed: Date.now() - this.startTime,
      });
      // #endregion

      console.log("[FastSpin Extractor DEBUG] Initialized.");
    },

    hookFetch() {
      const originalFetch = window.fetch;
      const self = this;

      // #region agent log - Fetch Hook 安装
      logDebug("B", "hookFetch", "Fetch hook 安装", {
        originalFetchExists: !!originalFetch,
      });
      // #endregion

      window.fetch = async function (input, init) {
        const url =
          typeof input === "string" ? input : input?.url || String(input);

        // #region agent log - Fetch 请求捕获
        logDebug("B", "fetch:request", "Fetch 请求被捕获", {
          url: url.substring(0, 100),
          method: init?.method || "GET",
        });
        // #endregion

        try {
          const response = await originalFetch.apply(this, arguments);
          const clone = response.clone();

          // #region agent log - Fetch 响应
          logDebug("B", "fetch:response", "Fetch 响应", {
            url: url.substring(0, 100),
            status: response.status,
            ok: response.ok,
          });
          // #endregion

          self.processResource(url, clone);
          return response;
        } catch (e) {
          // #region agent log - Fetch 错误
          logDebug("B", "fetch:error", "Fetch 错误", {
            url: url.substring(0, 100),
            error: e.message,
          });
          // #endregion
          throw e;
        }
      };
    },

    hookXHR() {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      const self = this;

      // #region agent log - XHR Hook 安装
      logDebug("C", "hookXHR", "XHR hook 安装", {
        originalOpenExists: !!originalOpen,
        originalSendExists: !!originalSend,
      });
      // #endregion

      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._fsUrl = url;
        this._fsMethod = method;

        // #region agent log - XHR open 调用
        logDebug("C", "xhr:open", "XHR open 被调用", {
          method,
          url: String(url).substring(0, 100),
        });
        // #endregion

        return originalOpen.apply(this, [method, url, ...rest]);
      };

      XMLHttpRequest.prototype.send = function (body) {
        const xhr = this;
        const url = this._fsUrl;

        xhr.addEventListener("load", function () {
          // #region agent log - XHR load 事件
          logDebug("C", "xhr:load", "XHR load 事件", {
            url: String(url).substring(0, 100),
            status: xhr.status,
            responseType: xhr.responseType,
          });
          // #endregion

          if (xhr.status === 200) {
            self.processXHRResource(url, xhr);
          }
        });

        return originalSend.apply(this, arguments);
      };
    },

    hookImage() {
      const self = this;
      const originalImage = window.Image;

      // #region agent log - Image Hook 安装
      logDebug("A", "hookImage", "Image hook 安装", {
        originalImageExists: !!originalImage,
      });
      // #endregion

      window.Image = function (width, height) {
        const img = new originalImage(width, height);

        try {
          const originalSrcSetter = Object.getOwnPropertyDescriptor(
            HTMLImageElement.prototype,
            "src"
          ).set;

          Object.defineProperty(img, "src", {
            set(value) {
              // #region agent log - Image src 设置
              logDebug("A", "image:src", "Image src 被设置", {
                src: String(value).substring(0, 100),
              });
              // #endregion

              if (value) {
                self.addResource(value, "texture", { type: "image" });
              }
              return originalSrcSetter.call(this, value);
            },
            get() {
              return this.getAttribute("src");
            },
          });
        } catch (e) {
          // #region agent log - Image Hook 错误
          logDebug("A", "image:hookError", "Image src hook 失败", {
            error: e.message,
          });
          // #endregion
        }

        return img;
      };
    },

    hookAudio() {
      const self = this;
      const originalAudio = window.Audio;

      // #region agent log - Audio Hook 安装
      logDebug("A", "hookAudio", "Audio hook 安装", {
        originalAudioExists: !!originalAudio,
      });
      // #endregion

      window.Audio = function (src) {
        // #region agent log - Audio 创建
        logDebug("A", "audio:new", "new Audio() 被调用", {
          src: src ? String(src).substring(0, 100) : null,
        });
        // #endregion

        const audio = new originalAudio(src);
        if (src) {
          self.addResource(src, "audio", { type: "audio" });
        }
        return audio;
      };
    },

    async processResource(url, response) {
      const ext = this.getExtension(url);

      // #region agent log - 资源处理
      logDebug("D", "processResource", "处理资源", {
        url: url.substring(0, 100),
        ext,
        filename: this.getFilename(url),
      });
      // #endregion

      if (ext === "json") {
        try {
          const data = await response.json();
          // #region agent log - JSON 解析成功
          logDebug("D", "processResource:json", "JSON 解析成功", {
            url: url.substring(0, 80),
            hasData: !!data,
            keys: data ? Object.keys(data).slice(0, 5) : [],
          });
          // #endregion
          this.classifyJson(url, data);
        } catch (e) {
          // #region agent log - JSON 解析失败
          logDebug("D", "processResource:jsonError", "JSON 解析失败", {
            url: url.substring(0, 80),
            error: e.message,
          });
          // #endregion
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
        // #region agent log - 未知扩展名
        logDebug("D", "processResource:unknown", "未知扩展名", {
          url: url.substring(0, 80),
          ext,
        });
        // #endregion
        this.addResource(url, "other");
      }
    },

    processXHRResource(url, xhr) {
      const ext = this.getExtension(url);

      // #region agent log - XHR 资源处理
      logDebug("C", "processXHRResource", "XHR 资源处理", {
        url: String(url).substring(0, 100),
        ext,
        responseTextLength: xhr.responseText?.length || 0,
      });
      // #endregion

      if (ext === "json") {
        try {
          const data = JSON.parse(xhr.responseText);
          this.classifyJson(url, data);
        } catch (e) {
          // #region agent log - XHR JSON 解析失败
          logDebug("C", "processXHRResource:jsonError", "XHR JSON 解析失败", {
            url: String(url).substring(0, 80),
            error: e.message,
          });
          // #endregion
          this.addResource(url, "other");
        }
      } else {
        // 对于非 JSON 的 XHR 响应，直接添加
        if (ext === "atlas") {
          this.addResource(url, "spine_atlas");
        } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
          this.addResource(url, "texture");
        } else if (["mp3", "ogg", "wav", "m4a"].includes(ext)) {
          this.addResource(url, "audio");
        }
      }
    },

    classifyJson(url, data) {
      // #region agent log - JSON 分类
      logDebug("E", "classifyJson", "JSON 分类开始", {
        url: url.substring(0, 80),
        hasSkeleton: !!data.skeleton,
        hasFrames: !!data.frames,
        hasLayers: !!(data.layers && data.fr),
      });
      // #endregion

      if (data.skeleton && data.bones && data.slots) {
        this.addResource(url, "spine_skeleton", {
          spineVersion: data.skeleton.spine,
        });
        return;
      }

      if (data.frames && data.meta) {
        this.addResource(url, "sprite_sheet", {
          spriteCount: Object.keys(data.frames).length,
          textureFile: data.meta.image,
        });
        return;
      }

      if (data.v && data.fr && data.layers) {
        this.addResource(url, "lottie", {
          lottieVersion: data.v,
        });
        return;
      }

      if (url.includes("zh_CN") || url.includes("en_US")) {
        this.addResource(url, "locale");
        return;
      }

      this.addResource(url, "config");
    },

    addResource(url, category, metadata = {}) {
      const normalizedUrl = this.normalizeUrl(url);

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

    // 导出调试日志
    exportDebugLogs() {
      console.log("\n========== DEBUG LOGS ==========");

      // 按假设分组统计
      const byHypothesis = {};
      for (const log of debugLogs) {
        const h = log.hypothesisId;
        if (!byHypothesis[h]) byHypothesis[h] = [];
        byHypothesis[h].push(log);
      }

      console.log("\n--- 假设 A (Hook 时机/Image/Audio) ---");
      console.log(`日志数: ${byHypothesis["A"]?.length || 0}`);
      (byHypothesis["A"] || [])
        .slice(0, 10)
        .forEach((l) => console.log(`  ${l.location}: ${l.message}`, l.data));

      console.log("\n--- 假设 B (Fetch Hook) ---");
      console.log(`日志数: ${byHypothesis["B"]?.length || 0}`);
      (byHypothesis["B"] || [])
        .slice(0, 10)
        .forEach((l) => console.log(`  ${l.location}: ${l.message}`, l.data));

      console.log("\n--- 假设 C (XHR Hook) ---");
      console.log(`日志数: ${byHypothesis["C"]?.length || 0}`);
      (byHypothesis["C"] || [])
        .slice(0, 10)
        .forEach((l) => console.log(`  ${l.location}: ${l.message}`, l.data));

      console.log("\n--- 假设 D (扩展名解析) ---");
      console.log(`日志数: ${byHypothesis["D"]?.length || 0}`);
      (byHypothesis["D"] || [])
        .slice(0, 10)
        .forEach((l) => console.log(`  ${l.location}: ${l.message}`, l.data));

      console.log("\n--- 假设 E (JSON 分类) ---");
      console.log(`日志数: ${byHypothesis["E"]?.length || 0}`);
      (byHypothesis["E"] || [])
        .slice(0, 10)
        .forEach((l) => console.log(`  ${l.location}: ${l.message}`, l.data));

      console.log("\n================================\n");

      return debugLogs;
    },

    export(format = "json") {
      const data = {
        exportTime: new Date().toISOString(),
        pageUrl: window.location.href,
        totalResources: this.resources.length,
        categories: {},
        resources: this.resources,
        debugLogs: debugLogs,
      };

      for (const [category, items] of Object.entries(this.categories)) {
        data.categories[category] = items.length;
      }

      if (format === "json") {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fastspin_debug_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        console.log("Debug data exported to JSON file");
      }

      return data;
    },
  };

  // 初始化
  fsExtractor.init();
  window.fsExtractor = fsExtractor;

  console.log("\n[DEBUG] 脚本已注入! 请执行以下操作:");
  console.log("1. 如果页面已加载完成，请刷新页面");
  console.log("2. 等待游戏加载完成后，执行: window.fsExtractor.summary()");
  console.log("3. 查看调试日志: window.fsExtractor.exportDebugLogs()");
  console.log("4. 导出完整数据: window.fsExtractor.export()");
})();
