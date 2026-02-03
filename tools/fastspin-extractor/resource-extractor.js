#!/usr/bin/env node
/**
 * HAR Resource Extractor - 从 HAR 文件提取所有资源并分析资源结构
 * 用法: node resource-extractor.js <har-file> [output-dir]
 */

const fs = require("fs");
const path = require("path");

// 资源类型配置
const RESOURCE_TYPES = {
  // 图片资源
  image: {
    extensions: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
    mimeTypes: [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ],
    folder: "images",
  },
  // Spine 动画
  spine: {
    extensions: [".json", ".skel", ".atlas"],
    mimeTypes: ["application/json"],
    folder: "spine",
    patterns: [/\.atlas$/, /\.skel$/, /_ani\.json$/, /spine/i],
  },
  // 音频
  audio: {
    extensions: [".mp3", ".ogg", ".wav", ".m4a", ".aac"],
    mimeTypes: ["audio/mpeg", "audio/ogg", "audio/wav", "audio/mp4"],
    folder: "audio",
  },
  // 精灵图集
  spritesheet: {
    extensions: [".json"],
    mimeTypes: ["application/json"],
    folder: "spritesheets",
    patterns: [/spritesheet/i, /\.json$/],
  },
  // 配置文件
  config: {
    extensions: [".json"],
    mimeTypes: ["application/json"],
    folder: "config",
    patterns: [/config/i, /project\.json$/, /settings/i],
  },
  // 字体
  font: {
    extensions: [".fnt", ".xml", ".ttf", ".woff", ".woff2"],
    mimeTypes: ["font/ttf", "font/woff", "font/woff2", "application/xml"],
    folder: "fonts",
  },
  // JavaScript
  javascript: {
    extensions: [".js"],
    mimeTypes: ["application/javascript", "text/javascript"],
    folder: "js",
  },
  // CSS
  css: {
    extensions: [".css"],
    mimeTypes: ["text/css"],
    folder: "css",
  },
  // HTML
  html: {
    extensions: [".html", ".htm", ".jsp"],
    mimeTypes: ["text/html"],
    folder: "html",
  },
};

// 代码中的资源引用模式
const CODE_RESOURCE_PATTERNS = {
  // PIXI.Sprite.from / fromFrame
  pixiSprite: /PIXI\.Sprite\.(?:from|fromFrame)\s*\(\s*["']([^"']+)["']/g,
  // PIXI.Texture.fromFrame
  pixiTexture: /PIXI\.Texture\.(?:from|fromFrame)\s*\(\s*["']([^"']+)["']/g,
  // Spine 动画名
  spineName: /spineName\s*[=:]\s*["']([^"']+)["']/g,
  // type: "spine"
  spineType:
    /type\s*[=:]\s*["']spine["']\s*,\s*spineName\s*[=:]\s*["']([^"']+)["']/g,
  // texture: "xxx"
  texture: /texture\s*[=:]\s*["']([^"']+)["']/g,
  // resource.xxx
  resource: /resource\.(\w+)/g,
  // 图片路径
  imagePath: /["']([^"']*\.(?:png|jpg|jpeg|gif|webp))["']/gi,
  // 音频路径
  audioPath: /["']([^"']*\.(?:mp3|ogg|wav|m4a))["']/gi,
  // JSON 路径
  jsonPath: /["']([^"']*\.json)["']/gi,
  // symbols_X.png 模式
  symbolFrame: /symbols_(\d+)(?:_(\d+))?(?:_blur)?\.png/g,
  // 动画帧模式
  animFrame: /([a-z_]+)_?(\d+)\.png/gi,
};

/**
 * 从 HAR 文件中提取所有资源
 */
function extractResourcesFromHAR(harContent) {
  const har = JSON.parse(harContent);
  const entries = har.log?.entries || [];
  const resources = [];

  for (const entry of entries) {
    const url = entry.request?.url || "";
    const content = entry.response?.content?.text;
    const mimeType = entry.response?.content?.mimeType || "";
    const encoding = entry.response?.content?.encoding;
    const size = entry.response?.content?.size || 0;

    if (!url) continue;

    // 解析 URL
    let urlObj;
    try {
      urlObj = new URL(url);
    } catch (e) {
      continue;
    }

    const pathname = urlObj.pathname;
    const filename = path.basename(pathname).split("?")[0];
    const ext = path.extname(filename).toLowerCase();

    // 确定资源类型
    const resourceType = categorizeResource(url, mimeType, ext, filename);

    // 处理内容
    let resourceContent = null;
    let isBase64 = false;

    if (content) {
      if (encoding === "base64") {
        resourceContent = content;
        isBase64 = true;
      } else {
        resourceContent = content;
      }
    }

    resources.push({
      url: url,
      filename: filename,
      pathname: pathname,
      ext: ext,
      mimeType: mimeType,
      type: resourceType,
      size: size,
      content: resourceContent,
      isBase64: isBase64,
      hasContent: !!content,
    });
  }

  return resources;
}

/**
 * 分类资源类型
 */
function categorizeResource(url, mimeType, ext, filename) {
  const urlLower = url.toLowerCase();
  const filenameLower = filename.toLowerCase();

  // 优先检查 Spine 动画
  if (
    ext === ".atlas" ||
    ext === ".skel" ||
    (ext === ".json" &&
      (filenameLower.includes("_ani") || filenameLower.includes("spine")))
  ) {
    return "spine";
  }

  // 检查精灵图集 (JSON 文件且有对应的 PNG)
  if (
    ext === ".json" &&
    !filenameLower.includes("project") &&
    !filenameLower.includes("config") &&
    !filenameLower.includes("setting")
  ) {
    // 可能是精灵图集
    if (
      urlLower.includes("assets") ||
      urlLower.includes("sym") ||
      urlLower.includes("sprite") ||
      urlLower.includes("sheet")
    ) {
      return "spritesheet";
    }
  }

  // 按类型匹配
  for (const [type, config] of Object.entries(RESOURCE_TYPES)) {
    if (config.extensions.includes(ext)) {
      // 进一步检查 patterns
      if (config.patterns) {
        for (const pattern of config.patterns) {
          if (pattern.test(url) || pattern.test(filename)) {
            return type;
          }
        }
      }
      return type;
    }

    if (config.mimeTypes.some((m) => mimeType.includes(m))) {
      return type;
    }
  }

  return "other";
}

/**
 * 从代码中提取资源引用
 */
function extractResourceReferencesFromCode(codeDir) {
  const references = {
    sprites: new Set(),
    textures: new Set(),
    spineAnimations: new Set(),
    resources: new Set(),
    images: new Set(),
    audio: new Set(),
    json: new Set(),
    symbolFrames: [],
    animationFrames: [],
  };

  // 读取所有 JS 文件
  const jsFiles = [];
  function findJSFiles(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        findJSFiles(fullPath);
      } else if (file.endsWith(".js")) {
        jsFiles.push(fullPath);
      }
    }
  }
  findJSFiles(codeDir);

  // 分析每个文件
  for (const jsFile of jsFiles) {
    const content = fs.readFileSync(jsFile, "utf-8");

    // 提取 PIXI.Sprite 引用
    let match;
    const pixiSpriteRegex =
      /PIXI\.Sprite\.(?:from|fromFrame)\s*\(\s*["']([^"']+)["']/g;
    while ((match = pixiSpriteRegex.exec(content)) !== null) {
      references.sprites.add(match[1]);
    }

    // 提取 PIXI.Texture 引用
    const pixiTextureRegex =
      /PIXI\.Texture\.(?:from|fromFrame)\s*\(\s*["']([^"']+)["']/g;
    while ((match = pixiTextureRegex.exec(content)) !== null) {
      references.textures.add(match[1]);
    }

    // 提取 Spine 动画名
    const spineNameRegex = /spineName\s*[=:]\s*["']([^"']+)["']/g;
    while ((match = spineNameRegex.exec(content)) !== null) {
      references.spineAnimations.add(match[1]);
    }

    // 提取 resource.xxx
    const resourceRegex = /resource\.(\w+)/g;
    while ((match = resourceRegex.exec(content)) !== null) {
      references.resources.add(match[1]);
    }

    // 提取图片路径
    const imageRegex = /["']([^"']*\.(?:png|jpg|jpeg|gif|webp))["']/gi;
    while ((match = imageRegex.exec(content)) !== null) {
      references.images.add(match[1]);
    }

    // 提取音频路径
    const audioRegex = /["']([^"']*\.(?:mp3|ogg|wav|m4a))["']/gi;
    while ((match = audioRegex.exec(content)) !== null) {
      references.audio.add(match[1]);
    }

    // 提取 JSON 路径
    const jsonRegex = /["']([^"']*\.json)["']/gi;
    while ((match = jsonRegex.exec(content)) !== null) {
      references.json.add(match[1]);
    }

    // 提取符号帧模式
    const symbolRegex = /symbols_(\d+)(?:_(\d+))?(?:_blur)?\.png/g;
    while ((match = symbolRegex.exec(content)) !== null) {
      references.symbolFrames.push({
        full: match[0],
        index: parseInt(match[1]),
        variant: match[2] ? parseInt(match[2]) : null,
      });
    }
  }

  return references;
}

/**
 * 分析资源结构
 */
function analyzeResourceStructure(resources, codeReferences) {
  const analysis = {
    summary: {
      total: resources.length,
      byType: {},
      totalSize: 0,
    },
    spriteSheets: [],
    spineAnimations: [],
    symbols: {
      count: 0,
      indices: new Set(),
      variants: new Map(),
    },
    codeReferences: codeReferences,
    resourceMap: {},
  };

  // 统计资源类型
  for (const res of resources) {
    if (!analysis.summary.byType[res.type]) {
      analysis.summary.byType[res.type] = {
        count: 0,
        size: 0,
        files: [],
      };
    }
    analysis.summary.byType[res.type].count++;
    analysis.summary.byType[res.type].size += res.size;
    analysis.summary.byType[res.type].files.push(res.filename);
    analysis.summary.totalSize += res.size;

    // 构建资源映射
    analysis.resourceMap[res.filename] = res;
  }

  // 分析精灵图集
  const jsonResources = resources.filter(
    (r) => r.ext === ".json" && r.type === "spritesheet"
  );
  for (const json of jsonResources) {
    const baseName = json.filename.replace(".json", "");
    const pngRes = resources.find((r) => r.filename === baseName + ".png");

    analysis.spriteSheets.push({
      json: json.filename,
      png: pngRes ? pngRes.filename : null,
      url: json.url,
      size: json.size + (pngRes ? pngRes.size : 0),
    });
  }

  // 分析 Spine 动画
  const atlasResources = resources.filter((r) => r.ext === ".atlas");
  for (const atlas of atlasResources) {
    const baseName = atlas.filename.replace(".atlas", "");
    const jsonRes = resources.find(
      (r) =>
        r.filename === baseName + ".json" ||
        r.filename === baseName + "_ani.json"
    );
    const pngRes = resources.find((r) => r.filename === baseName + ".png");

    analysis.spineAnimations.push({
      name: baseName,
      atlas: atlas.filename,
      json: jsonRes ? jsonRes.filename : null,
      png: pngRes ? pngRes.filename : null,
      url: atlas.url,
    });
  }

  // 分析符号
  for (const frame of codeReferences.symbolFrames) {
    analysis.symbols.indices.add(frame.index);
    if (frame.variant !== null) {
      if (!analysis.symbols.variants.has(frame.index)) {
        analysis.symbols.variants.set(frame.index, new Set());
      }
      analysis.symbols.variants.get(frame.index).add(frame.variant);
    }
  }
  analysis.symbols.count = analysis.symbols.indices.size;

  return analysis;
}

/**
 * 保存资源到文件系统
 */
function saveResources(resources, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const savedFiles = [];
  const typeStats = {};

  for (const res of resources) {
    if (!res.content) continue;

    const typeConfig = RESOURCE_TYPES[res.type] || { folder: "other" };
    const typeDir = path.join(outputDir, typeConfig.folder);

    if (!fs.existsSync(typeDir)) {
      fs.mkdirSync(typeDir, { recursive: true });
    }

    const outputPath = path.join(typeDir, res.filename);

    try {
      if (res.isBase64) {
        // 二进制文件
        const buffer = Buffer.from(res.content, "base64");
        fs.writeFileSync(outputPath, buffer);
      } else {
        // 文本文件
        fs.writeFileSync(outputPath, res.content);
      }

      savedFiles.push({
        path: outputPath,
        type: res.type,
        size: res.size,
      });

      if (!typeStats[res.type]) {
        typeStats[res.type] = { count: 0, size: 0 };
      }
      typeStats[res.type].count++;
      typeStats[res.type].size += res.size;
    } catch (e) {
      console.warn(`Warning: Failed to save ${res.filename}: ${e.message}`);
    }
  }

  return { savedFiles, typeStats };
}

/**
 * 生成资源分析报告
 */
function generateReport(analysis, outputDir) {
  const report = {
    generatedAt: new Date().toISOString(),
    summary: analysis.summary,
    resourceCategories: {
      spriteSheets: analysis.spriteSheets,
      spineAnimations: analysis.spineAnimations,
      symbols: {
        count: analysis.symbols.count,
        indices: Array.from(analysis.symbols.indices).sort((a, b) => a - b),
        variants: {},
      },
    },
    codeReferences: {
      sprites: Array.from(analysis.codeReferences.sprites),
      textures: Array.from(analysis.codeReferences.textures),
      spineAnimations: Array.from(analysis.codeReferences.spineAnimations),
      resources: Array.from(analysis.codeReferences.resources),
    },
  };

  // 转换 Map 为对象
  for (const [idx, variants] of analysis.symbols.variants) {
    report.resourceCategories.symbols.variants[idx] = Array.from(variants);
  }

  const reportPath = path.join(outputDir, "resource-analysis.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // 生成 Markdown 报告
  const mdReport = generateMarkdownReport(report, analysis);
  const mdPath = path.join(outputDir, "RESOURCE_STRUCTURE.md");
  fs.writeFileSync(mdPath, mdReport);

  return { reportPath, mdPath };
}

/**
 * 生成 Markdown 报告
 */
function generateMarkdownReport(report, analysis) {
  let md = `# FastSpin 资源结构分析

## 概述

| 指标 | 值 |
|------|------|
| 总资源数 | ${report.summary.total} |
| 总大小 | ${(report.summary.totalSize / 1024 / 1024).toFixed(2)} MB |
| 生成时间 | ${report.generatedAt} |

## 资源类型分布

| 类型 | 数量 | 大小 |
|------|------|------|
`;

  for (const [type, data] of Object.entries(report.summary.byType)) {
    md += `| ${type} | ${data.count} | ${(data.size / 1024).toFixed(1)} KB |\n`;
  }

  md += `
## 精灵图集 (Spritesheets)

| JSON 文件 | PNG 文件 | 大小 |
|-----------|----------|------|
`;

  for (const sheet of report.resourceCategories.spriteSheets) {
    md += `| ${sheet.json} | ${sheet.png || "N/A"} | ${(
      sheet.size / 1024
    ).toFixed(1)} KB |\n`;
  }

  md += `
## Spine 动画

| 名称 | Atlas | JSON | PNG |
|------|-------|------|-----|
`;

  for (const spine of report.resourceCategories.spineAnimations) {
    md += `| ${spine.name} | ${spine.atlas} | ${spine.json || "N/A"} | ${
      spine.png || "N/A"
    } |\n`;
  }

  md += `
## 符号系统 (Symbols)

- **符号数量**: ${report.resourceCategories.symbols.count}
- **符号索引**: ${report.resourceCategories.symbols.indices.join(", ")}

### 符号变体

| 符号索引 | 变体 |
|----------|------|
`;

  for (const [idx, variants] of Object.entries(
    report.resourceCategories.symbols.variants
  )) {
    md += `| ${idx} | ${variants.join(", ")} |\n`;
  }

  md += `
## 代码中的资源引用

### Sprites (${report.codeReferences.sprites.length})

\`\`\`
${report.codeReferences.sprites.slice(0, 30).join("\n")}
${
  report.codeReferences.sprites.length > 30
    ? `\n... and ${report.codeReferences.sprites.length - 30} more`
    : ""
}
\`\`\`

### Textures (${report.codeReferences.textures.length})

\`\`\`
${report.codeReferences.textures.slice(0, 30).join("\n")}
${
  report.codeReferences.textures.length > 30
    ? `\n... and ${report.codeReferences.textures.length - 30} more`
    : ""
}
\`\`\`

### Spine Animations (${report.codeReferences.spineAnimations.length})

\`\`\`
${report.codeReferences.spineAnimations.join("\n")}
\`\`\`

### Resource References (${report.codeReferences.resources.length})

\`\`\`
${report.codeReferences.resources.join("\n")}
\`\`\`

## 资源加载推测

基于代码分析，资源加载顺序可能为：

1. **预加载阶段**
   - 加载 \`project.json\` 配置
   - 加载公共库和 polyfills

2. **主要资源加载**
   - 符号精灵图集 (\`sym_*.json\` + \`sym_*.png\`)
   - 主游戏背景 (\`maingame_bg_p\`)
   - 控制栏资源

3. **动画资源加载**
   - Spine 骨骼动画 (\`.atlas\` + \`.json\` + \`.png\`)
   - 特效动画

4. **音频资源**
   - 背景音乐
   - 音效

5. **免费游戏资源** (按需加载)
   - 免费游戏背景
   - 特殊动画
`;

  return md;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
HAR Resource Extractor - 从 HAR 文件提取资源并分析结构

用法: node resource-extractor.js <har-file> [output-dir]

参数:
  har-file    HAR 文件路径
  output-dir  输出目录 (默认: ./resources)

示例:
  node resource-extractor.js game.har
  node resource-extractor.js game.har ./output/resources
`);
    process.exit(0);
  }

  const harFile = args[0];
  const outputDir = args[1] || "./resources";
  const codeDir = path.join(path.dirname(outputDir), "extracted");

  if (!fs.existsSync(harFile)) {
    console.error(`Error: HAR file not found: ${harFile}`);
    process.exit(1);
  }

  console.log(`\n📦 HAR Resource Extractor`);
  console.log(`=====================================`);
  console.log(`📂 HAR File:    ${harFile}`);
  console.log(`📁 Output:      ${outputDir}`);
  console.log(`📁 Code Dir:    ${codeDir}`);
  console.log(`=====================================\n`);

  // 1. 从 HAR 提取资源
  console.log(`⏳ Reading HAR file...`);
  const harContent = fs.readFileSync(harFile, "utf-8");

  console.log(`🔍 Extracting resources...`);
  const resources = extractResourcesFromHAR(harContent);
  console.log(`✅ Found ${resources.length} resources\n`);

  // 2. 从代码提取资源引用
  console.log(`📖 Analyzing code for resource references...`);
  const codeReferences = extractResourceReferencesFromCode(codeDir);
  console.log(
    `✅ Found ${codeReferences.sprites.size} sprite refs, ${codeReferences.spineAnimations.size} spine refs\n`
  );

  // 3. 分析资源结构
  console.log(`📊 Analyzing resource structure...`);
  const analysis = analyzeResourceStructure(resources, codeReferences);

  // 4. 保存资源
  console.log(`💾 Saving resources...`);
  const { savedFiles, typeStats } = saveResources(resources, outputDir);
  console.log(`✅ Saved ${savedFiles.length} files\n`);

  // 5. 生成报告
  console.log(`📋 Generating reports...`);
  const { reportPath, mdPath } = generateReport(analysis, outputDir);

  // 6. 打印摘要
  console.log(`\n=====================================`);
  console.log(`📈 Summary`);
  console.log(`=====================================`);
  console.log(`📁 Total Resources: ${resources.length}`);
  console.log(
    `💾 Total Size: ${(analysis.summary.totalSize / 1024 / 1024).toFixed(2)} MB`
  );

  console.log(`\n📂 By Type:`);
  for (const [type, data] of Object.entries(typeStats)) {
    console.log(
      `  • ${type}: ${data.count} files, ${(data.size / 1024).toFixed(1)} KB`
    );
  }

  console.log(`\n🎨 Sprite Sheets: ${analysis.spriteSheets.length}`);
  for (const sheet of analysis.spriteSheets.slice(0, 5)) {
    console.log(`  • ${sheet.json}`);
  }
  if (analysis.spriteSheets.length > 5) {
    console.log(`  ... and ${analysis.spriteSheets.length - 5} more`);
  }

  console.log(`\n🦴 Spine Animations: ${analysis.spineAnimations.length}`);
  for (const spine of analysis.spineAnimations.slice(0, 5)) {
    console.log(`  • ${spine.name}`);
  }
  if (analysis.spineAnimations.length > 5) {
    console.log(`  ... and ${analysis.spineAnimations.length - 5} more`);
  }

  console.log(`\n🎰 Symbols: ${analysis.symbols.count} unique indices`);

  console.log(`\n📋 Reports:`);
  console.log(`  • ${reportPath}`);
  console.log(`  • ${mdPath}`);

  console.log(`\n✅ Resource extraction complete!`);
  console.log(`📂 Resources saved to: ${path.resolve(outputDir)}\n`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
