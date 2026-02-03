#!/usr/bin/env node
/**
 * LZMA JS Decompressor - 解压 FastSpin 游戏中的 LZMA 压缩 JS
 * 用法: node lzma-decompressor.js <input-file> [output-file]
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

/**
 * 从 eval(function(n)...) 格式中提取并执行解压
 */
function decompressLZMA(code) {
  // 检查是否是 LZMA 压缩格式
  if (!code.startsWith("eval(function(n)")) {
    console.log("Not LZMA compressed, returning original code");
    return code;
  }

  try {
    // 提取 eval 内的函数
    const evalMatch = code.match(/^eval\((function[\s\S]+)\)$/);
    if (!evalMatch) {
      throw new Error("Cannot extract eval function");
    }

    // 创建沙箱环境
    const sandbox = {
      result: null,
      console: console,
      Error: Error,
      Math: Math,
      String: String,
      parseInt: parseInt,
      parseFloat: parseFloat,
    };

    // 修改代码：将 eval 改为赋值给 result
    const modifiedCode = `
      result = (${evalMatch[1]});
    `;

    // 在沙箱中执行
    vm.createContext(sandbox);
    vm.runInContext(modifiedCode, sandbox);

    if (typeof sandbox.result === "string") {
      return sandbox.result;
    } else {
      throw new Error("Decompression did not return string");
    }
  } catch (e) {
    console.error("Decompression error:", e.message);

    // 尝试另一种方式：直接执行
    try {
      // 使用 Function 构造函数来执行
      const func = new Function(`
        var __result__;
        var __eval__ = function(x) { __result__ = x; return x; };
        ${code.replace(/^eval\(/, "__eval__(")}
        return __result__;
      `);
      const result = func();
      if (typeof result === "string") {
        return result;
      }
    } catch (e2) {
      console.error("Alternative decompression also failed:", e2.message);
    }

    return null;
  }
}

/**
 * 美化解压后的代码
 */
function beautifyCode(code) {
  try {
    // 基本换行处理
    let result = code;

    // 处理模块定义
    result = result.replace(/define\(/g, "\ndefine(");
    result = result.replace(/require\(/g, "\nrequire(");

    // 在分号后添加换行
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

        if (
          line.endsWith("{") ||
          line.endsWith("[") ||
          (line.endsWith("(") && !line.includes("function"))
        ) {
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
 * 分析解压后的代码
 */
function analyzeDecompressedCode(code, filename) {
  const analysis = {
    filename: filename,
    size: code.length,
    modules: [],
    classes: [],
    functions: [],
    patterns: {
      defineBlocks: [],
      requireCalls: [],
      eventBindings: [],
      componentRegistrations: [],
    },
  };

  // 提取 define 块
  const defineRegex = /define\s*\(\s*["']([^"']+)["']/g;
  let match;
  while ((match = defineRegex.exec(code)) !== null) {
    analysis.modules.push({
      name: match[1],
      position: match.index,
    });
  }

  // 提取类定义
  const classRegex =
    /(?:class\s+(\w+)|(\w+)\s*=\s*(?:function\s*\(|Class\.extend)|(\w+)\.prototype\s*=)/g;
  while ((match = classRegex.exec(code)) !== null) {
    const name = match[1] || match[2] || match[3];
    if (
      name &&
      name.length > 2 &&
      !analysis.classes.find((c) => c.name === name)
    ) {
      analysis.classes.push({
        name: name,
        position: match.index,
      });
    }
  }

  // 提取关键函数
  const funcRegex =
    /(?:function\s+(\w+)\s*\(|(\w+)\s*:\s*function\s*\(|\.(\w+)\s*=\s*function\s*\()/g;
  const importantFuncs = [
    "init",
    "start",
    "stop",
    "update",
    "render",
    "spin",
    "play",
    "load",
    "create",
    "destroy",
  ];
  while ((match = funcRegex.exec(code)) !== null) {
    const name = match[1] || match[2] || match[3];
    if (name && (name.length > 3 || importantFuncs.includes(name))) {
      if (!analysis.functions.find((f) => f.name === name)) {
        analysis.functions.push({
          name: name,
          position: match.index,
        });
      }
    }
  }

  // 提取事件绑定
  const eventRegex = /\.on\s*\(\s*["']([^"']+)["']/g;
  while ((match = eventRegex.exec(code)) !== null) {
    analysis.patterns.eventBindings.push({
      event: match[1],
      position: match.index,
    });
  }

  return analysis;
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
LZMA JS Decompressor - 解压 FastSpin 游戏的 LZMA 压缩 JS

用法: node lzma-decompressor.js <input-file> [output-file]

参数:
  input-file   输入的压缩 JS 文件
  output-file  输出文件 (默认: input_decompressed.js)

示例:
  node lzma-decompressor.js slot.js
  node lzma-decompressor.js slot.js slot_readable.js
`);
    process.exit(0);
  }

  const inputFile = args[0];
  const outputFile = args[1] || inputFile.replace(".js", "_decompressed.js");

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  console.log(`\n📦 LZMA JS Decompressor`);
  console.log(`=====================================`);
  console.log(`📂 Input:  ${inputFile}`);
  console.log(`📁 Output: ${outputFile}`);
  console.log(`=====================================\n`);

  // 读取文件
  const code = fs.readFileSync(inputFile, "utf-8");
  console.log(`⏳ Original size: ${(code.length / 1024).toFixed(1)} KB`);

  // 解压
  console.log(`🔧 Decompressing...`);
  const decompressed = decompressLZMA(code);

  if (decompressed) {
    console.log(
      `✅ Decompressed size: ${(decompressed.length / 1024).toFixed(1)} KB`
    );

    // 美化
    console.log(`🎨 Beautifying code...`);
    const beautified = beautifyCode(decompressed);

    // 保存
    fs.writeFileSync(outputFile, beautified);
    console.log(`💾 Saved to: ${outputFile}`);

    // 分析
    console.log(`\n📊 Analyzing code...`);
    const analysis = analyzeDecompressedCode(
      decompressed,
      path.basename(inputFile)
    );

    console.log(`\n=====================================`);
    console.log(`📈 Analysis Results`);
    console.log(`=====================================`);
    console.log(`📦 Modules found: ${analysis.modules.length}`);
    console.log(`📚 Classes found: ${analysis.classes.length}`);
    console.log(`⚡ Functions found: ${analysis.functions.length}`);
    console.log(`🔔 Event bindings: ${analysis.patterns.eventBindings.length}`);

    if (analysis.modules.length > 0) {
      console.log(`\n📦 Modules:`);
      analysis.modules.slice(0, 20).forEach((m) => {
        console.log(`  • ${m.name}`);
      });
      if (analysis.modules.length > 20) {
        console.log(`  ... and ${analysis.modules.length - 20} more`);
      }
    }

    if (analysis.classes.length > 0) {
      console.log(`\n📚 Classes:`);
      analysis.classes.slice(0, 15).forEach((c) => {
        console.log(`  • ${c.name}`);
      });
      if (analysis.classes.length > 15) {
        console.log(`  ... and ${analysis.classes.length - 15} more`);
      }
    }

    // 保存分析结果
    const analysisFile = outputFile.replace(".js", "_analysis.json");
    fs.writeFileSync(analysisFile, JSON.stringify(analysis, null, 2));
    console.log(`\n📊 Analysis saved to: ${analysisFile}`);
  } else {
    console.log(`❌ Decompression failed`);
    process.exit(1);
  }

  console.log(`\n✅ Done!`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
