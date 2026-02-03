/**
 * FastSpin 资源提取脚本 - 直接复制到浏览器控制台使用
 *
 * 使用方法：
 * 1. 打开游戏页面
 * 2. F12 打开控制台
 * 3. 复制此脚本全部内容，粘贴到控制台运行
 * 4. 刷新页面（脚本会自动重新注入）
 * 5. 等待游戏加载完成后执行 fsSummary() 或 fsExport()
 */

(function () {
  if (window.__fsHooked) {
    console.log("[FS] 已注入，执行 fsSummary() 查看统计");
    return;
  }
  window.__fsHooked = true;

  window.__fsResources = [];
  window.__fsResourceMap = new Map();

  const addResource = (url, type, meta = {}) => {
    if (!url || typeof url !== "string") return;

    // 规范化 URL
    try {
      url = new URL(url, window.location.href).href;
    } catch (e) {
      return;
    }

    if (window.__fsResourceMap.has(url)) return;

    const filename = url.split("/").pop().split("?")[0];
    const res = { url, type, filename, ...meta, time: Date.now() };
    window.__fsResources.push(res);
    window.__fsResourceMap.set(url, res);
    console.log(
      `%c[${type}]%c ${filename}`,
      "color: #4CAF50; font-weight: bold;",
      "color: #888;"
    );
  };

  // ========== Hook Fetch ==========
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url || String(input);

    const resp = await origFetch.apply(this, arguments);

    try {
      const clone = resp.clone();
      const ext = url
        .split("/")
        .pop()
        .split("?")[0]
        .split(".")
        .pop()
        .toLowerCase();

      if (ext === "json") {
        const text = await clone.text();
        try {
          const data = JSON.parse(text);
          if (data.skeleton && data.bones) {
            addResource(url, "spine", { version: data.skeleton?.spine });
          } else if (data.frames && data.meta) {
            addResource(url, "sprite", {
              count: Object.keys(data.frames).length,
              texture: data.meta?.image,
            });
          } else if (data.v && data.fr && data.layers) {
            addResource(url, "lottie", { version: data.v, name: data.nm });
          } else if (
            url.includes("zh_CN") ||
            url.includes("en_US") ||
            url.includes("locale")
          ) {
            addResource(url, "locale");
          } else {
            addResource(url, "config");
          }
        } catch (e) {
          addResource(url, "json");
        }
      } else if (ext === "atlas") {
        addResource(url, "atlas");
      } else if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
        addResource(url, "texture");
      } else if (["mp3", "ogg", "wav", "m4a", "aac"].includes(ext)) {
        addResource(url, "audio");
      } else if (["ttf", "otf", "woff", "woff2"].includes(ext)) {
        addResource(url, "font");
      } else if (ext === "xml") {
        addResource(url, "xml");
      } else if (ext === "css") {
        addResource(url, "css");
      } else if (ext === "js") {
        addResource(url, "js");
      }
    } catch (e) {}

    return resp;
  };

  // ========== Hook XHR ==========
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__fsUrl = url;
    this.__fsMethod = method;
    return origOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const xhr = this;

    xhr.addEventListener("load", function () {
      if (xhr.status === 200 && xhr.__fsUrl) {
        const url = String(xhr.__fsUrl);
        const ext = url
          .split("/")
          .pop()
          .split("?")[0]
          .split(".")
          .pop()
          .toLowerCase();

        if (ext === "json") {
          try {
            const data = JSON.parse(xhr.responseText);
            if (data.skeleton && data.bones) {
              addResource(url, "spine", { version: data.skeleton?.spine });
            } else if (data.frames && data.meta) {
              addResource(url, "sprite", {
                count: Object.keys(data.frames).length,
                texture: data.meta?.image,
              });
            } else if (data.v && data.fr && data.layers) {
              addResource(url, "lottie", { version: data.v });
            } else if (url.includes("zh_CN") || url.includes("en_US")) {
              addResource(url, "locale");
            } else {
              addResource(url, "config");
            }
          } catch (e) {
            addResource(url, "json");
          }
        } else if (ext === "atlas") {
          addResource(url, "atlas");
        } else if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
          addResource(url, "texture");
        } else if (["mp3", "ogg", "wav", "m4a"].includes(ext)) {
          addResource(url, "audio");
        } else if (ext === "xml") {
          addResource(url, "xml");
        }
      }
    });

    return origSend.apply(this, arguments);
  };

  // ========== Hook Image ==========
  const OrigImage = window.Image;
  window.Image = function (w, h) {
    const img = new OrigImage(w, h);
    try {
      const origSrcDesc = Object.getOwnPropertyDescriptor(
        HTMLImageElement.prototype,
        "src"
      );
      if (origSrcDesc && origSrcDesc.set) {
        Object.defineProperty(img, "src", {
          set(v) {
            if (v) addResource(v, "texture");
            return origSrcDesc.set.call(this, v);
          },
          get() {
            return this.getAttribute("src");
          },
        });
      }
    } catch (e) {}
    return img;
  };
  window.Image.prototype = OrigImage.prototype;

  // ========== Hook Audio ==========
  const OrigAudio = window.Audio;
  window.Audio = function (src) {
    if (src) addResource(src, "audio");
    return new OrigAudio(src);
  };
  window.Audio.prototype = OrigAudio.prototype;

  // ========== 导出命令 ==========

  // 显示统计
  window.fsSummary = function () {
    const byType = {};
    window.__fsResources.forEach((r) => {
      byType[r.type] = (byType[r.type] || 0) + 1;
    });

    console.log(
      "\n%c========== FastSpin 资源统计 ==========",
      "color: #4CAF50; font-size: 14px;"
    );
    console.table(byType);
    console.log(
      "%c总计: " + window.__fsResources.length + " 个资源",
      "color: #4CAF50; font-weight: bold;"
    );
    console.log(
      "%c==========================================\n",
      "color: #4CAF50;"
    );

    return byType;
  };

  // 导出 JSON
  window.fsExport = function () {
    const data = {
      exportTime: new Date().toISOString(),
      gameUrl: window.location.href,
      totalCount: window.__fsResources.length,
      byType: {},
      resources: window.__fsResources,
    };

    window.__fsResources.forEach((r) => {
      data.byType[r.type] = (data.byType[r.type] || 0) + 1;
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fastspin_resources_" + Date.now() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);

    console.log(
      "%c✓ 已导出 " + data.totalCount + " 个资源",
      "color: #4CAF50; font-weight: bold;"
    );
    return data;
  };

  // 获取 URL 列表
  window.fsURLs = function (type) {
    let list = window.__fsResources;
    if (type) {
      list = list.filter((r) => r.type === type);
    }
    return list.map((r) => r.url);
  };

  // 获取完整列表
  window.fsList = function (type) {
    if (type) {
      return window.__fsResources.filter((r) => r.type === type);
    }
    return window.__fsResources;
  };

  // 生成下载脚本
  window.fsScript = function () {
    const script = `#!/bin/bash
# FastSpin Resources - ${new Date().toISOString()}
# Total: ${window.__fsResources.length} files

mkdir -p fastspin/{spine,atlas,sprite,lottie,texture,audio,font,config,locale,other}

${window.__fsResources
  .map((r) => {
    let dir = r.type;
    if (dir === "xml") dir = "font";
    if (dir === "json" || dir === "css" || dir === "js") dir = "other";
    return `curl -o "fastspin/${dir}/${r.filename}" "${r.url}"`;
  })
  .join("\n")}

echo "Done!"`;

    const blob = new Blob([script], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "download_fastspin.sh";
    a.click();

    console.log("%c✓ 下载脚本已生成", "color: #4CAF50;");
    return script;
  };

  // ========== 初始化完成 ==========
  console.log(
    "%c\n🎰 FastSpin Resource Extractor 已启动!\n",
    "color: #4CAF50; font-size: 16px; font-weight: bold;"
  );
  console.log("%c可用命令:", "color: #2196F3; font-weight: bold;");
  console.log("  fsSummary()     - 显示资源统计");
  console.log("  fsExport()      - 导出 JSON 文件");
  console.log("  fsURLs()        - 获取所有 URL");
  console.log('  fsURLs("spine") - 获取指定类型的 URL');
  console.log("  fsList()        - 获取完整资源列表");
  console.log("  fsScript()      - 生成下载脚本");
  console.log("\n%c提示: 刷新页面后重新粘贴此脚本运行\n", "color: #ff9800;");
})();
