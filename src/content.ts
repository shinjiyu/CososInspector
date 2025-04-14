// 注入资源到页面
function injectResources(): void {
    // 注入CSS
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.runtime.getURL('inspector.css');
    document.head.appendChild(style);

    // 注入主脚本
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('dist/injected.js');
    document.head.appendChild(script);
}

// 页面加载完成后注入
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectResources);
} else {
    injectResources();
} 