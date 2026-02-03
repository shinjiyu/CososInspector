#!/usr/bin/env node
/**
 * HAR JS Extractor - 从 HAR 文件中提取 JavaScript 代码
 * 用法: node har-extract.js <har-file> [output-dir]
 */

const fs = require("fs");
const path = require("path");

// 配置
const config = {
  // 输出目录
  outputDir: "./extracted",
  // 是否美化代码
  beautify: true,
  // 是否生成分析报告
  generateReport: true,
};

// FastSpin 特有模式 (与 js-analyzer.html 保持一致)
const FASTSPIN_PATTERNS = {
  "Component Registration":
    /(?:registerComponent|addComponent|createComponent)\s*\(\s*['"]([\w]+)['"]/g,
  "Event Binding": /(?:on|addEventListener|bind)\s*\(\s*['"]([\w:]+)['"]/g,
  "Asset Loading":
    /(?:loadAsset|loadRes|loadBundle)\s*\(\s*['"]([\w\/\.]+)['"]/g,
  "Scene Management":
    /(?:loadScene|changeScene|pushScene)\s*\(\s*['"]([\w]+)['"]/g,
  "Spine Creation": /(?:sp\.Skeleton|spine\.Skeleton|new\s+Spine)/g,
  "Sprite Creation": /(?:cc\.Sprite|new\s+Sprite|createSprite)/g,
  "Node Creation": /(?:new\s+cc\.Node|createNode|addChild)\s*\(/g,
  Animation:
    /(?:animation\.play|playAnimation|runAction)\s*\(\s*['"]([\w]+)['"]/g,
  "State Machine": /(?:setState|changeState|FSM|StateMachine)/g,
  "Pool System": /(?:NodePool|ObjectPool|getFromPool|returnToPool)/g,
  "Signal/Event": /(?:emit|dispatch|trigger|signal)\s*\(\s*['"]([\w:]+)['"]/g,
  Configuration: /(?:config|Config|settings|Settings|options|Options)\s*[=:]/g,
  "Module Export":
    /(?:module\.exports|export\s+(?:default|class|function|const))/g,
  "Module Import": /(?:require\s*\(|import\s+.*\s+from)/g,
  PixiJS: /(?:PIXI\.|new\s+PIXI\.\w+|pixi\.)/gi,
  "Cocos Creator": /(?:cc\.|cc\.Component|cc\.Node|cc\.director)/g,
  WebGL: /(?:gl\.|WebGLRenderingContext|getContext\s*\(\s*['"]webgl)/g,
};

/**
 * 从 HAR 文件中提取 JS 内容
 */
function extractJSFromHAR(harContent) {
  const har = JSON.parse(harContent);
  const entries = har.log?.entries || [];
  const files = [];

  for (const entry of entries) {
    const url = entry.request?.url || "";
    const content = entry.response?.content?.text;
    const mimeType = entry.response?.content?.mimeType || "";
    const encoding = entry.response?.content?.encoding;

    // 检查是否是 JS 文件
    if ((url.endsWith(".js") || mimeType.includes("javascript")) && content) {
      let jsContent = content;

      // 如果是 base64 编码，解码
      if (encoding === "base64") {
        try {
          jsContent = Buffer.from(content, "base64").toString("utf-8");
        } catch (e) {
          console.warn(`Warning: Failed to decode base64 for ${url}`);
          continue;
        }
      }

      // 提取文件名
      const urlObj = new URL(url);
      let filename = path.basename(urlObj.pathname);
      if (!filename.endsWith(".js")) {
        filename += ".js";
      }

      // 获取文件路径层级
      const pathParts = urlObj.pathname.split("/").filter((p) => p);
      const category = categorizeFile(url, pathParts);

      files.push({
        name: filename,
        url: url,
        content: jsContent,
        size: jsContent.length,
        category: category,
        pathParts: pathParts,
      });
    }
  }

  // 排序文件（按加载顺序）
  files.sort((a, b) => {
    const order = [
      "polyfill",
      "lib",
      "engine",
      "pixi",
      "spine",
      "slot",
      "game",
      "setup",
      "main",
    ];
    const aIdx = order.findIndex((o) => a.name.toLowerCase().includes(o));
    const bIdx = order.findIndex((o) => b.name.toLowerCase().includes(o));
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });

  return files;
}

/**
 * 分类文件
 */
function categorizeFile(url, pathParts) {
  const urlLower = url.toLowerCase();
  const filename = pathParts[pathParts.length - 1] || "";

  if (urlLower.includes("lib") || urlLower.includes("vendor")) return "lib";
  if (
    urlLower.includes("engine") ||
    urlLower.includes("pixi") ||
    urlLower.includes("phaser")
  )
    return "engine";
  if (urlLower.includes("spine")) return "spine";
  if (urlLower.includes("slot")) return "slot";
  if (urlLower.includes("game")) return "game";
  if (urlLower.includes("component")) return "component";
  if (
    urlLower.includes("setup") ||
    urlLower.includes("main") ||
    urlLower.includes("index")
  )
    return "entry";
  if (urlLower.includes("polyfill") || urlLower.includes("shim"))
    return "polyfill";
  return "other";
}

/**
 * 简单的代码美化
 */
function beautifyCode(code) {
  try {
    // 基本换行处理
    let result = code;

    // 在分号后添加换行（如果不在字符串中）
    result = result.replace(/;(?=\s*[^\n\r])/g, ";\n");

    // 在大括号后添加换行
    result = result.replace(/\{(?=\s*[^\n\r])/g, "{\n");
    result = result.replace(/\}(?=\s*[^\n\r}])/g, "}\n");

    // 添加缩进
    let indent = 0;
    const lines = result.split("\n");
    result = lines
      .map((line) => {
        line = line.trim();
        if (!line) return "";

        if (
          line.startsWith("}") ||
          line.startsWith("]") ||
          line.startsWith(")")
        ) {
          indent = Math.max(0, indent - 1);
        }

        const indentedLine = "  ".repeat(indent) + line;

        if (line.endsWith("{") || line.endsWith("[") || line.endsWith("(")) {
          indent++;
        }

        return indentedLine;
      })
      .join("\n");

    return result;
  } catch (e) {
    return code;
  }
}

/**
 * 分析代码
 */
function analyzeCode(code, filename) {
  const analysis = {
    classes: [],
    functions: [],
    patterns: {},
  };

  // 提取类定义
  const classRegex =
    /(?:class\s+(\w+)(?:\s+extends\s+(\w+))?|(\w+)\s*=\s*(?:function|class)|\b(\w+)\.prototype\b)/g;
  let match;
  while ((match = classRegex.exec(code)) !== null) {
    const name = match[1] || match[3] || match[4];
    if (
      name &&
      name.length > 2 &&
      !analysis.classes.find((c) => c.name === name)
    ) {
      analysis.classes.push({
        name: name,
        extends: match[2] || null,
        position: match.index,
      });
    }
  }

  // 提取函数定义
  const funcRegex =
    /(?:function\s+(\w+)|(\w+)\s*[=:]\s*(?:async\s+)?function|\b(\w+)\s*\([^)]*\)\s*\{)/g;
  while ((match = funcRegex.exec(code)) !== null) {
    const name = match[1] || match[2] || match[3];
    if (
      name &&
      name.length > 2 &&
      !["if", "for", "while", "switch", "catch", "function"].includes(name)
    ) {
      if (!analysis.functions.find((f) => f.name === name)) {
        analysis.functions.push({
          name: name,
          position: match.index,
        });
      }
    }
  }

  // 检测模式
  for (const [patternName, regex] of Object.entries(FASTSPIN_PATTERNS)) {
    const patternRegex = new RegExp(regex.source, regex.flags);
    const matches = [];
    while ((match = patternRegex.exec(code)) !== null) {
      matches.push({
        match: match[0],
        value: match[1] || match[0],
        position: match.index,
      });
    }
    if (matches.length > 0) {
      analysis.patterns[patternName] = matches;
    }
  }

  return analysis;
}

/**
 * 检测引擎类型
 */
function detectEngine(files) {
  const indicators = {
    pixijs: 0,
    cocos: 0,
    phaser: 0,
    three: 0,
    spine: 0,
    createjs: 0,
    custom: 0,
  };

  const allContent = files.map((f) => f.content).join("\n");

  // PixiJS 特征
  if (
    /PIXI\.Application|PIXI\.Container|PIXI\.Sprite|PIXI\.Graphics/i.test(
      allContent
    )
  ) {
    indicators.pixijs += 10;
  }
  if (/pixi-spine|PIXI\.spine/i.test(allContent)) {
    indicators.pixijs += 5;
    indicators.spine += 5;
  }

  // Cocos Creator 特征
  if (/cc\.Component|cc\.Node|cc\.director|cc\.game/i.test(allContent)) {
    indicators.cocos += 10;
  }

  // Phaser 特征
  if (/Phaser\.Game|Phaser\.Scene|phaser\.min/i.test(allContent)) {
    indicators.phaser += 10;
  }

  // Three.js 特征
  if (/THREE\.Scene|THREE\.Camera|THREE\.Renderer/i.test(allContent)) {
    indicators.three += 10;
  }

  // Spine 特征
  if (/spine\.Skeleton|\.atlas|spine-ts|pixi-spine/i.test(allContent)) {
    indicators.spine += 5;
  }

  // 计算最可能的引擎
  const sorted = Object.entries(indicators).sort((a, b) => b[1] - a[1]);
  return {
    primary: sorted[0][0],
    scores: indicators,
    sorted: sorted,
  };
}

/**
 * 生成分析报告
 */
function generateReport(files, outputDir) {
  const report = {
    extractTime: new Date().toISOString(),
    summary: {
      totalFiles: files.length,
      totalSize: files.reduce((a, f) => a + f.size, 0),
      categories: {},
    },
    engine: detectEngine(files),
    files: [],
    allClasses: [],
    allFunctions: [],
    allPatterns: {},
  };

  // 按类别统计
  for (const file of files) {
    if (!report.summary.categories[file.category]) {
      report.summary.categories[file.category] = { count: 0, size: 0 };
    }
    report.summary.categories[file.category].count++;
    report.summary.categories[file.category].size += file.size;

    // 分析文件
    const analysis = analyzeCode(file.content, file.name);

    report.files.push({
      name: file.name,
      url: file.url,
      size: file.size,
      category: file.category,
      classCount: analysis.classes.length,
      functionCount: analysis.functions.length,
      patternCount: Object.values(analysis.patterns).reduce(
        (a, p) => a + p.length,
        0
      ),
    });

    // 合并所有类
    for (const cls of analysis.classes) {
      if (!report.allClasses.find((c) => c.name === cls.name)) {
        report.allClasses.push({ ...cls, file: file.name });
      }
    }

    // 合并所有函数 (只保留前200个)
    for (const func of analysis.functions) {
      if (
        report.allFunctions.length < 200 &&
        !report.allFunctions.find((f) => f.name === func.name)
      ) {
        report.allFunctions.push({ ...func, file: file.name });
      }
    }

    // 合并所有模式
    for (const [patternName, matches] of Object.entries(analysis.patterns)) {
      if (!report.allPatterns[patternName]) {
        report.allPatterns[patternName] = [];
      }
      for (const m of matches) {
        report.allPatterns[patternName].push({ ...m, file: file.name });
      }
    }
  }

  return report;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
HAR JS Extractor - 从 HAR 文件中提取 JavaScript 代码

用法: node har-extract.js <har-file> [output-dir]

参数:
  har-file    HAR 文件路径
  output-dir  输出目录 (默认: ./extracted)

示例:
  node har-extract.js game.har
  node har-extract.js game.har ./output
`);
    process.exit(0);
  }

  const harFile = args[0];
  const outputDir = args[1] || config.outputDir;

  // 检查 HAR 文件是否存在
  if (!fs.existsSync(harFile)) {
    console.error(`Error: HAR file not found: ${harFile}`);
    process.exit(1);
  }

  console.log(`\n📦 HAR JS Extractor`);
  console.log(`=====================================`);
  console.log(`📂 Input:  ${harFile}`);
  console.log(`📁 Output: ${outputDir}`);
  console.log(`=====================================\n`);

  // 读取 HAR 文件
  console.log(`⏳ Reading HAR file...`);
  const harContent = fs.readFileSync(harFile, "utf-8");

  // 提取 JS 文件
  console.log(`🔍 Extracting JavaScript files...`);
  const files = extractJSFromHAR(harContent);

  if (files.length === 0) {
    console.log(`⚠️  No JavaScript files found in HAR.`);
    process.exit(0);
  }

  console.log(`✅ Found ${files.length} JavaScript files\n`);

  // 创建输出目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 按类别创建子目录
  const categories = [...new Set(files.map((f) => f.category))];
  for (const cat of categories) {
    const catDir = path.join(outputDir, cat);
    if (!fs.existsSync(catDir)) {
      fs.mkdirSync(catDir, { recursive: true });
    }
  }

  // 保存文件
  console.log(`💾 Saving files...\n`);
  for (const file of files) {
    const outputPath = path.join(outputDir, file.category, file.name);
    const content = config.beautify ? beautifyCode(file.content) : file.content;
    fs.writeFileSync(outputPath, content);
    console.log(
      `  ✓ ${file.category}/${file.name} (${(file.size / 1024).toFixed(1)} KB)`
    );
  }

  // 生成分析报告
  if (config.generateReport) {
    console.log(`\n📊 Generating analysis report...`);
    const report = generateReport(files, outputDir);
    const reportPath = path.join(outputDir, "analysis-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`  ✓ ${reportPath}`);

    // 打印摘要
    console.log(`\n=====================================`);
    console.log(`📈 Analysis Summary`);
    console.log(`=====================================`);
    console.log(`🎮 Detected Engine: ${report.engine.primary.toUpperCase()}`);
    console.log(`📁 Total Files: ${report.summary.totalFiles}`);
    console.log(
      `📦 Total Size: ${(report.summary.totalSize / 1024).toFixed(1)} KB`
    );
    console.log(`📚 Classes Found: ${report.allClasses.length}`);
    console.log(`⚡ Functions Found: ${report.allFunctions.length}`);
    console.log(
      `🔧 Patterns Found: ${Object.keys(report.allPatterns).length} types`
    );

    console.log(`\n📂 By Category:`);
    for (const [cat, data] of Object.entries(report.summary.categories)) {
      console.log(
        `  • ${cat}: ${data.count} files, ${(data.size / 1024).toFixed(1)} KB`
      );
    }

    // 显示重要的类
    if (report.allClasses.length > 0) {
      console.log(`\n📦 Key Classes (top 15):`);
      const keyClasses = report.allClasses
        .filter(
          (c) =>
            c.name.includes("Game") ||
            c.name.includes("Slot") ||
            c.name.includes("Spin") ||
            c.name.includes("Reel") ||
            c.name.includes("Symbol") ||
            c.name.includes("Manager") ||
            c.name.includes("Controller") ||
            c.extends
        )
        .slice(0, 15);

      for (const cls of keyClasses) {
        const ext = cls.extends ? ` extends ${cls.extends}` : "";
        console.log(`  • ${cls.name}${ext} (${cls.file})`);
      }
    }

    // 显示关键模式
    console.log(`\n🔧 Pattern Summary:`);
    for (const [pattern, matches] of Object.entries(report.allPatterns)) {
      console.log(`  • ${pattern}: ${matches.length} occurrences`);
    }
  }

  console.log(`\n✅ Extraction complete!`);
  console.log(`📂 Files saved to: ${path.resolve(outputDir)}\n`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
