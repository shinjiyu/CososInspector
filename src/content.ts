/// <reference path="./types/chrome.d.ts" />

// 注入资源到页面
function injectResources(): void {
    console.log('Injecting Cocos Inspector resources...');

    // 注入CSS
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.type = 'text/css';
    style.href = chrome.runtime.getURL('dist/inspector.css');
    document.head.appendChild(style);
    console.log('CSS injected:', style.href);

    // 注入主脚本
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('dist/injected.js');
    document.head.appendChild(script);
    console.log('Script injected:', script.src);
}

// 确保页面完全加载后再注入
if (document.readyState === 'complete') {
    injectResources();
} else {
    window.addEventListener('load', injectResources);
} 