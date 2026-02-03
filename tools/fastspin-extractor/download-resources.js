/**
 * FastSpin 资源下载器
 *
 * 用法: node download-resources.js <game_url> [output_dir]
 *
 * 示例:
 * node download-resources.js "https://go.fastspindemo.com/touch/fsnew/20240901P/games/fortunejewels2/index.jsp" ./output
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

class FastSpinDownloader {
  constructor(gameUrl, outputDir) {
    this.gameUrl = gameUrl;
    this.outputDir = outputDir || "./fastspin_output";
    this.parsedUrl = new URL(gameUrl);
    this.baseUrl = `${this.parsedUrl.protocol}//${this.parsedUrl.host}`;

    // 解析游戏路径
    const pathMatch = this.parsedUrl.pathname.match(
      /\/touch\/fsnew\/([^/]+)\/games\/([^/]+)/
    );
    if (pathMatch) {
      this.version = pathMatch[1];
      this.gameName = pathMatch[2];
      this.gameBasePath = `/touch/fsnew/${this.version}/games/${this.gameName}`;
      this.contentHost = "contents.fastspindemo.com";
    } else {
      throw new Error("Invalid FastSpin game URL");
    }

    this.downloadedUrls = new Set();
    this.pendingUrls = [];
    this.resources = {
      spine: [],
      lottie: [],
      sprites: [],
      audio: [],
      images: [],
      fonts: [],
      locales: [],
      configs: [],
    };
  }

  /**
   * 发起 HTTP 请求
   */
  async fetch(url, options = {}) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === "https:" ? https : http;

      const reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: options.method || "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          ...options.headers,
        },
      };

      const req = protocol.request(reqOptions, (res) => {
        let data = [];

        res.on("data", (chunk) => data.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(data);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            buffer: buffer,
            text: () => buffer.toString("utf-8"),
            json: () => JSON.parse(buffer.toString("utf-8")),
          });
        });
      });

      req.on("error", reject);
      req.end();
    });
  }

  /**
   * 下载文件
   */
  async downloadFile(url, outputPath) {
    if (this.downloadedUrls.has(url)) return;
    this.downloadedUrls.add(url);

    try {
      const response = await this.fetch(url);
      if (response.status !== 200) {
        console.log(`  [SKIP] ${url} (${response.status})`);
        return null;
      }

      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(outputPath, response.buffer);
      console.log(`  [OK] ${path.basename(outputPath)}`);
      return response;
    } catch (e) {
      console.log(`  [ERROR] ${url}: ${e.message}`);
      return null;
    }
  }

  /**
   * 加载并解析 project.json
   */
  async loadProjectConfig() {
    console.log("\n[1/5] Loading project.json...");

    const projectUrl = `https://${this.parsedUrl.host}${this.gameBasePath}/project.json`;

    try {
      const response = await this.fetch(projectUrl, { method: "POST" });
      const config = response.json();

      // 保存配置文件
      const configPath = path.join(this.outputDir, "project.json");
      fs.mkdirSync(this.outputDir, { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      console.log(`  Version: ${config.version}`);
      console.log(`  JS files: ${config.jsList?.length || 0}`);
      console.log(`  CSS files: ${config.cssList?.length || 0}`);
      console.log(`  Fonts: ${config.fonts?.length || 0}`);

      return config;
    } catch (e) {
      console.error("Failed to load project.json:", e.message);
      return null;
    }
  }

  /**
   * 加载 common.json
   */
  async loadCommonConfig() {
    console.log("\n[2/5] Loading common.json...");

    const commonUrl = `https://${this.parsedUrl.host}/touch/fsnew/common.json`;

    try {
      const response = await this.fetch(commonUrl, { method: "POST" });
      const config = response.json();

      const configPath = path.join(this.outputDir, "common.json");
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      console.log("  Common config saved");
      return config;
    } catch (e) {
      console.error("Failed to load common.json:", e.message);
      return null;
    }
  }

  /**
   * 扫描已知资源模式
   */
  async scanKnownResources(projectConfig) {
    console.log("\n[3/5] Scanning known resource patterns...");

    const contentBase = `https://${this.contentHost}${this.gameBasePath}/assets`;

    // 常见的资源文件模式
    const patterns = [
      // 背景和基础资源
      "bg",
      "reelback",
      "symbols",
      "symbols2",
      "sym_cache",
      // 控制栏
      "controlbar_bg",
      // 大奖
      "bigwin_common",
      "bigwin_effect",
      "bigwin_cache_zh_CN",
      "bigwin_lan_zh_CN",
      // 符号动画
      ...Array.from({ length: 20 }, (_, i) => `sym_${i}`),
      ...Array.from({ length: 20 }, (_, i) => `sym_10${i}`),
      // 特效
      "line_effect",
      "coin",
      "wheel",
      "wheel_small",
      "wheel_up",
      // 倍数
      "multiplier",
      "mul_num",
      // 功能
      "lucky_bet",
      "lucky_frame_1",
      "lucky_effect",
      // 介绍页
      "start",
      "intropage_light",
      "intropage_2_bg",
      "intropage_2_common",
      "intropage_2_effect",
      "intropage_2_circle",
      "intropage_2_coin",
      "intropage_2_star",
      "intropage_2_lan_zh_CN",
      "intropage_2_cache_zh_CN",
      // 提示
      "tipswin_common",
      "tipswin_fire",
      "tipswin_metter",
      // 教程
      "tutorial_com",
      "tutorial_lan_zh_CN",
    ];

    const foundUrls = [];

    for (const pattern of patterns) {
      // 尝试不同的哈希模式
      // 注意：实际哈希需要从网络请求或 HTML 中获取
      // 这里只是演示模式
      foundUrls.push(`${pattern}.json`);
      foundUrls.push(`${pattern}.atlas`);
    }

    console.log(`  Found ${foundUrls.length} potential resource patterns`);
    return foundUrls;
  }

  /**
   * 分析 JSON 文件类型
   */
  analyzeJsonContent(content) {
    try {
      const data = typeof content === "string" ? JSON.parse(content) : content;

      // Spine 骨骼数据
      if (data.skeleton && data.bones && data.slots) {
        return {
          type: "spine",
          subtype: "skeleton",
          version: data.skeleton.spine,
        };
      }

      // TexturePacker 精灵图
      if (data.frames && data.meta) {
        return { type: "sprites", textureFile: data.meta.image };
      }

      // Lottie 动画
      if (data.v && data.fr && data.layers) {
        return { type: "lottie", version: data.v };
      }

      return { type: "configs" };
    } catch (e) {
      return { type: "unknown" };
    }
  }

  /**
   * 下载精灵图及其纹理
   */
  async downloadSpriteSheet(jsonUrl) {
    const response = await this.fetch(jsonUrl);
    if (response.status !== 200) return;

    const data = response.json();
    const analysis = this.analyzeJsonContent(data);

    if (analysis.type === "sprites" && analysis.textureFile) {
      // 下载纹理图片
      const textureUrl = jsonUrl.replace(/[^/]+$/, analysis.textureFile);
      const texturePath = path.join(
        this.outputDir,
        "sprites",
        analysis.textureFile
      );
      await this.downloadFile(textureUrl, texturePath);
    }

    return data;
  }

  /**
   * 生成资源清单
   */
  generateManifest() {
    const manifest = {
      gameUrl: this.gameUrl,
      gameName: this.gameName,
      version: this.version,
      extractedAt: new Date().toISOString(),
      resources: {},
    };

    // 遍历输出目录统计资源
    const walkDir = (dir, prefix = "") => {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        const relativePath = path.join(prefix, item.name);

        if (item.isDirectory()) {
          walkDir(fullPath, relativePath);
        } else {
          const ext = path.extname(item.name).toLowerCase();
          const category = this.getCategory(ext);

          if (!manifest.resources[category]) {
            manifest.resources[category] = [];
          }
          manifest.resources[category].push(relativePath);
        }
      }
    };

    if (fs.existsSync(this.outputDir)) {
      walkDir(this.outputDir);
    }

    return manifest;
  }

  getCategory(ext) {
    const categories = {
      ".json": "data",
      ".atlas": "spine",
      ".png": "images",
      ".jpg": "images",
      ".jpeg": "images",
      ".mp3": "audio",
      ".ogg": "audio",
      ".wav": "audio",
      ".ttf": "fonts",
      ".otf": "fonts",
      ".woff": "fonts",
      ".xml": "fonts",
      ".css": "styles",
    };
    return categories[ext] || "other";
  }

  /**
   * 运行提取器
   */
  async run() {
    console.log("========================================");
    console.log("FastSpin Resource Extractor");
    console.log("========================================");
    console.log(`Game: ${this.gameName}`);
    console.log(`Version: ${this.version}`);
    console.log(`Output: ${this.outputDir}`);

    // 1. 加载配置
    const projectConfig = await this.loadProjectConfig();
    const commonConfig = await this.loadCommonConfig();

    // 2. 扫描资源
    await this.scanKnownResources(projectConfig);

    // 3. 生成清单
    console.log("\n[4/5] Generating manifest...");
    const manifest = this.generateManifest();
    fs.writeFileSync(
      path.join(this.outputDir, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );

    // 4. 打印摘要
    console.log("\n[5/5] Summary:");
    for (const [category, files] of Object.entries(manifest.resources)) {
      console.log(`  ${category}: ${files.length} files`);
    }

    console.log("\n========================================");
    console.log("Extraction complete!");
    console.log(`Output directory: ${path.resolve(this.outputDir)}`);
    console.log("========================================");

    return manifest;
  }
}

/**
 * 从浏览器网络日志提取资源 URL
 */
function parseNetworkLog(logText) {
  const urls = [];
  const lines = logText.split("\n");

  for (const line of lines) {
    const match = line.match(/https?:\/\/[^\s"'<>]+/g);
    if (match) {
      urls.push(...match);
    }
  }

  // 过滤出资源 URL
  const resourceExts = [
    "json",
    "atlas",
    "png",
    "jpg",
    "mp3",
    "ogg",
    "xml",
    "ttf",
  ];
  return urls.filter((url) => {
    const ext = url.split(".").pop().split("?")[0].toLowerCase();
    return resourceExts.includes(ext);
  });
}

// 主程序
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log("Usage: node download-resources.js <game_url> [output_dir]");
    console.log("");
    console.log("Example:");
    console.log(
      '  node download-resources.js "https://go.fastspindemo.com/touch/fsnew/20240901P/games/fortunejewels2/index.jsp" ./output'
    );
    process.exit(1);
  }

  const gameUrl = args[0];
  const outputDir = args[1] || `./fastspin_${Date.now()}`;

  const downloader = new FastSpinDownloader(gameUrl, outputDir);
  downloader.run().catch(console.error);
}

module.exports = { FastSpinDownloader, parseNetworkLog };
