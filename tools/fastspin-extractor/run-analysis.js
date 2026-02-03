#!/usr/bin/env node
/**
 * FastSpin 引擎分析 - 一键执行脚本
 * 用法: node run-analysis.js <har-file> [output-dir]
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// 颜色输出
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(msg, color = "") {
  console.log(`${color}${msg}${colors.reset}`);
}

function logStep(step, total, msg) {
  log(`\n[${step}/${total}] ${msg}`, colors.cyan);
}

function run(cmd, cwd = __dirname) {
  try {
    execSync(cmd, { cwd, stdio: "inherit" });
    return true;
  } catch (e) {
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    log(
      `
╔═══════════════════════════════════════════════════════════╗
║       FastSpin 引擎分析工具 - 一键执行脚本                ║
╚═══════════════════════════════════════════════════════════╝

用法: node run-analysis.js <har-file> [output-dir]

参数:
  har-file    HAR 文件路径 (必需)
  output-dir  输出目录 (可选, 默认: ./output)

示例:
  node run-analysis.js ../game.har
  node run-analysis.js ../game.har ./my-output

工作流程:
  1. 提取 JavaScript 代码
  2. 解压 LZMA 压缩代码
  3. 提取游戏资源
  4. 按功能分类资源
  5. 生成分析报告
`,
      colors.bright
    );
    process.exit(0);
  }

  const harFile = path.resolve(args[0]);
  const outputDir = path.resolve(args[1] || "./output");

  if (!fs.existsSync(harFile)) {
    log(`❌ HAR 文件不存在: ${harFile}`, colors.yellow);
    process.exit(1);
  }

  log(
    `
╔═══════════════════════════════════════════════════════════╗
║       FastSpin 引擎分析工具 - 开始执行                    ║
╚═══════════════════════════════════════════════════════════╝
`,
    colors.bright
  );

  log(`📂 HAR 文件: ${harFile}`);
  log(`📁 输出目录: ${outputDir}`);

  const extractedDir = path.join(outputDir, "extracted");
  const resourcesDir = path.join(outputDir, "resources");
  const featureDir = path.join(outputDir, "resources-by-feature");

  // 创建输出目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const totalSteps = 4;
  let currentStep = 0;

  // 步骤 1: 提取 JS 代码
  currentStep++;
  logStep(currentStep, totalSteps, "提取 JavaScript 代码...");
  const harExtractPath = path.join(__dirname, "har-extract.js");
  if (!run(`node "${harExtractPath}" "${harFile}" "${extractedDir}"`)) {
    log("⚠️ JS 提取出现问题，继续执行...", colors.yellow);
  }

  // 步骤 2: 解压 LZMA 代码
  currentStep++;
  logStep(currentStep, totalSteps, "解压 LZMA 压缩代码...");
  const lzmaPath = path.join(__dirname, "lzma-decompressor.js");

  // 查找需要解压的文件
  const dirsToCheck = ["slot", "game"];
  for (const subdir of dirsToCheck) {
    const dir = path.join(extractedDir, subdir);
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.endsWith(".js") && !file.includes("_decompressed")) {
          const fullPath = path.join(dir, file);
          const content = fs.readFileSync(fullPath, "utf-8").slice(0, 50);
          if (content.includes("eval(function")) {
            log(`  📦 解压: ${file}`, colors.blue);
            run(`node "${lzmaPath}" "${fullPath}"`);
          }
        }
      }
    }
  }

  // 步骤 3: 提取资源
  currentStep++;
  logStep(currentStep, totalSteps, "提取游戏资源...");
  const resourceExtractPath = path.join(__dirname, "resource-extractor.js");
  if (!run(`node "${resourceExtractPath}" "${harFile}" "${resourcesDir}"`)) {
    log("⚠️ 资源提取出现问题，继续执行...", colors.yellow);
  }

  // 步骤 4: 功能分类
  currentStep++;
  logStep(currentStep, totalSteps, "按功能分类资源...");
  const classifierPath = path.join(__dirname, "resource-classifier.js");
  if (!run(`node "${classifierPath}" "${resourcesDir}" "${featureDir}"`)) {
    log("⚠️ 资源分类出现问题", colors.yellow);
  }

  // 完成
  log(
    `
╔═══════════════════════════════════════════════════════════╗
║                    ✅ 分析完成!                            ║
╚═══════════════════════════════════════════════════════════╝
`,
    colors.green
  );

  log(`📂 输出目录结构:`, colors.bright);
  log(`
${outputDir}/
├── extracted/              # JavaScript 代码
│   ├── slot/               # 老虎机逻辑
│   ├── game/               # 游戏逻辑
│   ├── lib/                # 第三方库
│   └── analysis-report.json
│
├── resources/              # 按类型分类的资源
│   ├── images/
│   ├── spine/
│   ├── audio/
│   └── RESOURCE_STRUCTURE.md
│
└── resources-by-feature/   # 按功能分类的资源
    ├── symbols/            # 符号
    ├── bigwin/             # 大奖动画
    ├── controlbar/         # 控制栏
    └── CLASSIFICATION_REPORT.md
`);

  log(`📋 查看报告:`, colors.bright);
  log(`  - ${path.join(extractedDir, "analysis-report.json")}`);
  log(`  - ${path.join(resourcesDir, "RESOURCE_STRUCTURE.md")}`);
  log(`  - ${path.join(featureDir, "CLASSIFICATION_REPORT.md")}`);
}

main();
