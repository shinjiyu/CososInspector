/**
 * FastSpin 游戏资源提取器
 *
 * 功能：
 * 1. 解析 project.json 获取资源列表
 * 2. 分析网络请求提取所有资源 URL
 * 3. 分类下载资源（Spine, Lottie, 精灵图, 音效等）
 * 4. 解包精灵图为独立图片
 */

class FastSpinExtractor {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.resources = {
      spine: [], // Spine 动画 (.json + .atlas)
      lottie: [], // Lottie 动画
      sprites: [], // TexturePacker 精灵图
      audio: [], // 音效文件
      fonts: [], // 字体文件
      images: [], // 独立图片
      locales: [], // 语言包
      configs: [], // 配置文件
    };
    this.projectConfig = null;
  }

  /**
   * 从 URL 中提取游戏路径信息
   */
  parseGameUrl(url) {
    const match = url.match(/\/touch\/fsnew\/([^/]+)\/games\/([^/]+)/);
    if (match) {
      return {
        version: match[1],
        gameName: match[2],
        baseGameUrl: url.substring(0, url.indexOf("/index.jsp")),
      };
    }
    return null;
  }

  /**
   * 加载 project.json
   */
  async loadProjectConfig(projectUrl) {
    try {
      const response = await fetch(projectUrl, { method: "POST" });
      this.projectConfig = await response.json();
      console.log("Project config loaded:", this.projectConfig);
      return this.projectConfig;
    } catch (e) {
      console.error("Failed to load project config:", e);
      return null;
    }
  }

  /**
   * 分析资源类型
   */
  classifyResource(url, content = null) {
    const ext = url.split(".").pop().split("?")[0].toLowerCase();

    // 音效文件
    if (["mp3", "ogg", "wav", "m4a"].includes(ext)) {
      return { type: "audio", ext };
    }

    // 图片文件
    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
      return { type: "images", ext };
    }

    // 字体文件
    if (["ttf", "otf", "woff", "woff2"].includes(ext)) {
      return { type: "fonts", ext };
    }

    // Atlas 文件 (Spine 纹理图集)
    if (ext === "atlas") {
      return { type: "spine", ext, subtype: "atlas" };
    }

    // XML 文件 (BitmapFont)
    if (ext === "xml") {
      return { type: "fonts", ext, subtype: "bitmap" };
    }

    // JSON 文件需要进一步分析内容
    if (ext === "json" && content) {
      return this.classifyJsonResource(url, content);
    }

    return { type: "configs", ext };
  }

  /**
   * 分析 JSON 资源类型
   */
  classifyJsonResource(url, content) {
    try {
      const data = typeof content === "string" ? JSON.parse(content) : content;

      // Spine 骨骼数据
      if (data.skeleton && data.bones && data.slots) {
        return {
          type: "spine",
          ext: "json",
          subtype: "skeleton",
          spineVersion: data.skeleton.spine,
        };
      }

      // TexturePacker 精灵图
      if (
        data.frames &&
        data.meta &&
        data.meta.app?.includes("texturepacker")
      ) {
        return {
          type: "sprites",
          ext: "json",
          textureFile: data.meta.image,
        };
      }

      // Lottie 动画
      if (data.v && data.fr && data.layers) {
        return {
          type: "lottie",
          ext: "json",
          lottieVersion: data.v,
        };
      }

      // 语言包
      if (
        url.includes("zh_CN") ||
        url.includes("en_US") ||
        (typeof data === "object" &&
          Object.values(data).every((v) => typeof v === "string"))
      ) {
        return { type: "locales", ext: "json" };
      }

      return { type: "configs", ext: "json" };
    } catch (e) {
      return { type: "configs", ext: "json" };
    }
  }

  /**
   * 从网络请求中提取资源
   */
  extractFromNetworkRequests(requests) {
    const resourceUrls = new Set();

    for (const req of requests) {
      const url = req.url || req;
      if (this.isResourceUrl(url)) {
        resourceUrls.add(url);
      }
    }

    return Array.from(resourceUrls);
  }

  /**
   * 判断是否为资源 URL
   */
  isResourceUrl(url) {
    const resourceExtensions = [
      "json",
      "atlas",
      "png",
      "jpg",
      "jpeg",
      "webp",
      "gif",
      "mp3",
      "ogg",
      "wav",
      "m4a",
      "ttf",
      "otf",
      "woff",
      "woff2",
      "xml",
      "css",
    ];

    const ext = url.split(".").pop().split("?")[0].toLowerCase();
    return resourceExtensions.includes(ext);
  }

  /**
   * 解包 TexturePacker 精灵图
   */
  async unpackSpriteSheet(jsonUrl, jsonData) {
    const sprites = [];
    const textureUrl = jsonUrl.replace(/[^/]+$/, jsonData.meta.image);

    // 加载纹理图片
    const img = await this.loadImage(textureUrl);

    for (const [name, frameData] of Object.entries(jsonData.frames)) {
      const { frame, rotated, trimmed, spriteSourceSize, sourceSize } =
        frameData;

      // 创建 canvas 提取单个精灵
      const canvas = document.createElement("canvas");
      canvas.width = sourceSize.w;
      canvas.height = sourceSize.h;
      const ctx = canvas.getContext("2d");

      if (rotated) {
        // 处理旋转的精灵
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

    return sprites;
  }

  /**
   * 加载图片
   */
  loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * 导出资源列表
   */
  exportResourceList() {
    return {
      projectConfig: this.projectConfig,
      resources: this.resources,
      summary: {
        spineAnimations: this.resources.spine.length,
        lottieAnimations: this.resources.lottie.length,
        spriteSheets: this.resources.sprites.length,
        audioFiles: this.resources.audio.length,
        fontFiles: this.resources.fonts.length,
        imageFiles: this.resources.images.length,
        localeFiles: this.resources.locales.length,
        configFiles: this.resources.configs.length,
      },
    };
  }

  /**
   * 生成下载脚本
   */
  generateDownloadScript(outputDir = "./fastspin_assets") {
    const urls = [];

    for (const [type, resources] of Object.entries(this.resources)) {
      for (const res of resources) {
        urls.push({
          url: res.url,
          type: type,
          filename: res.url.split("/").pop().split("?")[0],
        });
      }
    }

    // 生成 Node.js 下载脚本
    const script = `
const fs = require('fs');
const path = require('path');
const https = require('https');

const outputDir = '${outputDir}';
const resources = ${JSON.stringify(urls, null, 2)};

async function download(url, filepath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filepath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filepath, () => {});
            reject(err);
        });
    });
}

async function main() {
    for (const res of resources) {
        const dir = path.join(outputDir, res.type);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        const filepath = path.join(dir, res.filename);
        console.log('Downloading:', res.filename);
        
        try {
            await download(res.url, filepath);
        } catch (e) {
            console.error('Failed:', res.filename, e.message);
        }
    }
    
    console.log('Download complete!');
}

main();
`;

    return script;
  }
}

/**
 * 浏览器端资源嗅探器
 * 注入到页面中监控资源加载
 */
class ResourceSniffer {
  constructor() {
    this.capturedResources = [];
    this.originalFetch = null;
    this.originalXHR = null;
  }

  /**
   * 开始监控
   */
  start() {
    this.hookFetch();
    this.hookXHR();
    console.log("[ResourceSniffer] Started monitoring network requests");
  }

  /**
   * 停止监控
   */
  stop() {
    this.unhookFetch();
    this.unhookXHR();
    console.log("[ResourceSniffer] Stopped monitoring");
  }

  /**
   * Hook fetch API
   */
  hookFetch() {
    this.originalFetch = window.fetch;
    const self = this;

    window.fetch = async function (...args) {
      const url = args[0]?.url || args[0];
      const response = await self.originalFetch.apply(this, args);

      self.capturedResources.push({
        url: url,
        type: "fetch",
        status: response.status,
        timestamp: Date.now(),
      });

      return response;
    };
  }

  /**
   * Hook XMLHttpRequest
   */
  hookXHR() {
    this.originalXHR = window.XMLHttpRequest.prototype.open;
    const self = this;

    window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.addEventListener("load", function () {
        self.capturedResources.push({
          url: url,
          type: "xhr",
          method: method,
          status: this.status,
          timestamp: Date.now(),
        });
      });

      return self.originalXHR.call(this, method, url, ...rest);
    };
  }

  /**
   * 取消 Hook
   */
  unhookFetch() {
    if (this.originalFetch) {
      window.fetch = this.originalFetch;
    }
  }

  unhookXHR() {
    if (this.originalXHR) {
      window.XMLHttpRequest.prototype.open = this.originalXHR;
    }
  }

  /**
   * 获取捕获的资源
   */
  getResources() {
    return this.capturedResources;
  }

  /**
   * 导出资源列表
   */
  exportToConsole() {
    console.log("=== Captured Resources ===");

    const grouped = {};
    for (const res of this.capturedResources) {
      const ext = res.url.split(".").pop().split("?")[0].toLowerCase();
      if (!grouped[ext]) grouped[ext] = [];
      grouped[ext].push(res.url);
    }

    for (const [ext, urls] of Object.entries(grouped)) {
      console.log(`\n[${ext.toUpperCase()}] (${urls.length} files)`);
      urls.forEach((url) => console.log("  " + url));
    }

    return grouped;
  }
}

// 导出模块
if (typeof module !== "undefined" && module.exports) {
  module.exports = { FastSpinExtractor, ResourceSniffer };
} else {
  window.FastSpinExtractor = FastSpinExtractor;
  window.ResourceSniffer = ResourceSniffer;
}
