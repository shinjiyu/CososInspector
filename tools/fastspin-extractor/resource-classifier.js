#!/usr/bin/env node
/**
 * 资源功能分类器 - 按游戏功能重新组织资源
 * 用法: node resource-classifier.js [input-dir] [output-dir]
 */

const fs = require("fs");
const path = require("path");

// 功能分类规则
const FEATURE_CATEGORIES = {
  // 1. 符号资源 (老虎机符号)
  symbols: {
    patterns: [
      /^sym_\d+/i, // sym_0, sym_1, sym_2...
      /^sym_effect/i, // sym_effect
      /^symbols\d*/i, // symbols, symbols2
    ],
    description: "老虎机符号及动画",
  },

  // 2. 背景资源
  background: {
    patterns: [
      /^bg[_\.]/i, // bg.xxx, bg_b.xxx
      /^maingame_bg/i, // maingame_bg
      /^body_bg/i, // body_bg
      /^reelback/i, // reelback
    ],
    description: "游戏背景",
  },

  // 3. 控制栏 UI
  controlbar: {
    patterns: [
      /^controlbar/i, // controlbar_*
      /^fast_common/i, // fast_common
    ],
    description: "控制栏按钮和UI",
  },

  // 4. 大奖动画
  bigwin: {
    patterns: [
      /^bigwin/i, // bigwin_*
      /^tipswin/i, // tipswin_*
      /^coin\./i, // coin.xxx
    ],
    description: "大奖/奖金展示动画",
  },

  // 5. 开场/免费游戏
  intro_freegame: {
    patterns: [
      /^intropage/i, // intropage_*
      /^start[_\.]/i, // start.xxx, start_lan
      /^tutorial/i, // tutorial_*
    ],
    description: "开场动画和免费游戏",
  },

  // 6. 幸运投注
  luckybet: {
    patterns: [
      /^lucky/i, // lucky_*
      /^luckybet/i, // luckybet_*
    ],
    description: "幸运投注功能",
  },

  // 7. 转盘/乘数
  wheel_multiplier: {
    patterns: [
      /^wheel/i, // wheel_*
      /^multiplier/i, // multiplier
      /^mul_num/i, // mul_num
    ],
    description: "转盘和乘数",
  },

  // 8. 线奖效果
  line_effects: {
    patterns: [
      /^line_/i, // line_effect, line_num
      /^payout/i, // payout
    ],
    description: "线奖和赔付效果",
  },

  // 9. 多语言资源
  localization: {
    patterns: [
      /^zh_CN\./i, // zh_CN.xxx
      /_lan_zh_CN/i, // xxx_lan_zh_CN
      /_zh_CN\./i, // xxx_zh_CN.xxx
    ],
    description: "多语言文本资源",
  },

  // 10. 通用/精灵图集
  common: {
    patterns: [
      /^sprite\./i, // sprite.xxx
      /^img_\d+/i, // img_0, img_1...
      /^data\./i, // data.xxx
      /^common\./i, // common.json
      /^project\./i, // project.json
    ],
    description: "通用资源和精灵图集",
  },

  // 11. 音效
  audio: {
    patterns: [/\.mp3$/i, /\.ogg$/i, /\.wav$/i, /\.m4a$/i],
    description: "音频资源",
  },

  // 12. 字体
  fonts: {
    patterns: [/\.ttf$/i, /\.woff$/i, /\.fnt$/i, /font/i],
    description: "字体资源",
  },

  // 13. 脚本代码
  scripts: {
    patterns: [/\.js$/i],
    description: "JavaScript 代码",
  },

  // 14. 样式
  styles: {
    patterns: [/\.css$/i],
    description: "CSS 样式",
  },
};

// 音频文件功能细分
const AUDIO_SUBCATEGORIES = {
  bgm: {
    patterns: [/^m\d+_/i, /main/i, /intro/i, /^ultra/i],
    description: "背景音乐",
  },
  spin: {
    patterns: [/spin/i, /reel/i, /stop/i],
    description: "旋转音效",
  },
  win: {
    patterns: [/win/i, /total/i, /counting/i],
    description: "中奖音效",
  },
  feature: {
    patterns: [/wheel/i, /wild/i, /multiplier/i, /lucky/i],
    description: "特殊功能音效",
  },
  ui: {
    patterns: [/btn/i, /click/i, /button/i],
    description: "UI音效",
  },
};

/**
 * 确定文件的功能分类
 */
function classifyFile(filename) {
  const lowerName = filename.toLowerCase();

  for (const [category, config] of Object.entries(FEATURE_CATEGORIES)) {
    for (const pattern of config.patterns) {
      if (pattern.test(lowerName)) {
        return category;
      }
    }
  }

  return "other";
}

/**
 * 音频文件细分
 */
function classifyAudio(filename) {
  const lowerName = filename.toLowerCase();

  for (const [subcat, config] of Object.entries(AUDIO_SUBCATEGORIES)) {
    for (const pattern of config.patterns) {
      if (pattern.test(lowerName)) {
        return subcat;
      }
    }
  }

  return "other";
}

/**
 * 递归遍历目录
 */
function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else {
      callback(fullPath, file);
    }
  }
}

/**
 * 复制文件
 */
function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

/**
 * 主函数
 */
function main() {
  const args = process.argv.slice(2);
  const inputDir = args[0] || "./resources";
  const outputDir = args[1] || "./resources-by-feature";

  console.log(`\n🎯 资源功能分类器`);
  console.log(`=====================================`);
  console.log(`📂 输入目录: ${inputDir}`);
  console.log(`📁 输出目录: ${outputDir}`);
  console.log(`=====================================\n`);

  if (!fs.existsSync(inputDir)) {
    console.error(`❌ 输入目录不存在: ${inputDir}`);
    process.exit(1);
  }

  // 收集所有文件
  const allFiles = [];
  walkDir(inputDir, (fullPath, filename) => {
    // 跳过报告文件
    if (filename.endsWith(".md") || filename.endsWith(".json")) {
      if (filename.includes("analysis") || filename.includes("RESOURCE")) {
        return;
      }
    }
    allFiles.push({ path: fullPath, name: filename });
  });

  console.log(`📊 找到 ${allFiles.length} 个文件\n`);

  // 按功能分类
  const classified = {};
  const stats = {};

  for (const file of allFiles) {
    let category = classifyFile(file.name);

    // 音频文件进一步细分
    let subCategory = null;
    if (category === "audio") {
      subCategory = classifyAudio(file.name);
    }

    if (!classified[category]) {
      classified[category] = [];
      stats[category] = { count: 0, size: 0, files: [] };
    }

    const fileSize = fs.statSync(file.path).size;
    classified[category].push({
      ...file,
      subCategory,
      size: fileSize,
    });
    stats[category].count++;
    stats[category].size += fileSize;
    stats[category].files.push(file.name);
  }

  // 创建输出目录结构
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // 复制文件到新结构
  let totalCopied = 0;
  for (const [category, files] of Object.entries(classified)) {
    const categoryDir = path.join(outputDir, category);

    for (const file of files) {
      let destPath;

      // 音频文件放入子目录
      if (category === "audio" && file.subCategory) {
        destPath = path.join(categoryDir, file.subCategory, file.name);
      } else {
        destPath = path.join(categoryDir, file.name);
      }

      copyFile(file.path, destPath);
      totalCopied++;
    }
  }

  // 生成分类报告
  const report = {
    generatedAt: new Date().toISOString(),
    totalFiles: allFiles.length,
    categories: {},
  };

  for (const [category, data] of Object.entries(stats)) {
    const config = FEATURE_CATEGORIES[category] || { description: "其他资源" };
    report.categories[category] = {
      description: config.description,
      count: data.count,
      size: data.size,
      sizeFormatted: `${(data.size / 1024).toFixed(1)} KB`,
      files: data.files.slice(0, 20),
      hasMore: data.files.length > 20 ? data.files.length - 20 : 0,
    };
  }

  fs.writeFileSync(
    path.join(outputDir, "classification-report.json"),
    JSON.stringify(report, null, 2)
  );

  // 生成 Markdown 报告
  let md = `# 资源功能分类报告

生成时间: ${report.generatedAt}
总文件数: ${report.totalFiles}

## 分类概览

| 分类 | 描述 | 文件数 | 大小 |
|------|------|--------|------|
`;

  const sortedCategories = Object.entries(report.categories).sort(
    (a, b) => b[1].count - a[1].count
  );

  for (const [cat, data] of sortedCategories) {
    md += `| ${cat} | ${data.description} | ${data.count} | ${data.sizeFormatted} |\n`;
  }

  md += `\n## 详细分类\n`;

  for (const [cat, data] of sortedCategories) {
    md += `\n### ${cat} (${data.count} 个文件)\n\n`;
    md += `**描述**: ${data.description}\n\n`;
    md += `**大小**: ${data.sizeFormatted}\n\n`;
    md += `**文件列表**:\n\`\`\`\n`;
    md += data.files.join("\n");
    if (data.hasMore > 0) {
      md += `\n... 还有 ${data.hasMore} 个文件`;
    }
    md += `\n\`\`\`\n`;
  }

  fs.writeFileSync(path.join(outputDir, "CLASSIFICATION_REPORT.md"), md);

  // 打印结果
  console.log(`✅ 分类完成！复制了 ${totalCopied} 个文件\n`);
  console.log(`📊 分类统计:`);
  console.log(`=====================================`);

  for (const [cat, data] of sortedCategories) {
    const config = FEATURE_CATEGORIES[cat] || { description: "其他" };
    console.log(
      `📁 ${cat.padEnd(20)} ${data.count
        .toString()
        .padStart(4)} 个文件  ${data.sizeFormatted.padStart(12)}  - ${
        config.description
      }`
    );
  }

  console.log(`=====================================`);
  console.log(`\n📂 输出目录: ${path.resolve(outputDir)}`);
  console.log(`📋 报告: ${path.join(outputDir, "CLASSIFICATION_REPORT.md")}\n`);
}

main();
