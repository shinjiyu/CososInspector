# 环境检测功能文档

## 功能概述

环境检测功能确保 Cocos Inspector 只在包含 Cocos 引擎的页面中显示，避免在非 Cocos 页面中不必要的资源占用和界面干扰。

## 检测机制

### 1. 即时检测

在扩展注入时立即执行检测：

```typescript
private detectCocosEnvironment(): boolean {
    try {
        // 检查window.cc是否存在
        if (typeof window !== 'undefined' && window.cc) {
            logInfo('[环境检测] 发现window.cc对象');

            // 进一步检查cc.director是否存在
            if (window.cc.director) {
                logInfo('[环境检测] 发现cc.director对象');
                return true;
            } else {
                logWarn('[环境检测] window.cc存在但cc.director不存在，可能Cocos引擎尚未完全初始化');
                return false;
            }
        }

        logInfo('[环境检测] 未发现window.cc对象');
        return false;
    } catch (error) {
        logError('[环境检测] 检测Cocos环境时发生错误:', error);
        return false;
    }
}
```

### 2. 延迟检测

如果即时检测失败，启动延迟检测机制：

```typescript
private delayedEnvironmentCheck(): void {
    let checkCount = 0;
    const maxChecks = 20; // 最多检测20次
    const checkInterval = 500; // 每500ms检测一次

    const checkTimer = setInterval(() => {
        checkCount++;

        if (this.detectCocosEnvironment()) {
            logInfo(`[延迟检测] 第${checkCount}次检测成功，发现Cocos环境，正在初始化Inspector...`);
            clearInterval(checkTimer);
            this.init();
        } else if (checkCount >= maxChecks) {
            logInfo(`[延迟检测] 已检测${maxChecks}次，未发现Cocos环境，停止检测`);
            clearInterval(checkTimer);
        } else {
            logInfo(`[延迟检测] 第${checkCount}次检测，未发现Cocos环境，继续等待...`);
        }
    }, checkInterval);
}
```

## 检测条件

### 必要条件

1. **window.cc 存在**：全局 Cocos 对象必须存在
2. **cc.director 存在**：Cocos 导演对象必须存在且已初始化

### 检测时机

1. **页面加载时**：扩展脚本注入后立即检测
2. **延迟检测**：如果初始检测失败，每 500ms 检测一次
3. **检测超时**：最多检测 10 秒（20 次 × 500ms）

## 日志输出

### 成功检测

```
[Cocos Inspector] 检测到Cocos环境，正在初始化Inspector...
[环境检测] 发现window.cc对象
[环境检测] 发现cc.director对象
[Cocos Inspector] Inspector初始化完成，默认为收起状态
```

### 延迟检测成功

```
[Cocos Inspector] 未检测到Cocos环境，尝试延迟检测...
[延迟检测] 第1次检测，未发现Cocos环境，继续等待...
[延迟检测] 第2次检测，未发现Cocos环境，继续等待...
...
[延迟检测] 第5次检测成功，发现Cocos环境，正在初始化Inspector...
```

### 检测失败

```
[Cocos Inspector] 未检测到Cocos环境，尝试延迟检测...
[延迟检测] 第1次检测，未发现Cocos环境，继续等待...
...
[延迟检测] 已检测20次，未发现Cocos环境，停止检测
```

## 性能优化

### 资源节约

- **条件加载**：只在 Cocos 环境中创建 UI 和启动更新循环
- **内存优化**：非 Cocos 页面不会创建任何 DOM 元素
- **CPU 优化**：避免在非目标页面中执行不必要的检测和更新

### 检测效率

- **快速退出**：即时检测失败时立即启动延迟检测
- **合理间隔**：500ms 的检测间隔平衡了响应速度和性能
- **超时机制**：10 秒超时避免无限检测

## 兼容性考虑

### Cocos 版本兼容

- **Cocos Creator 2.x**：支持 `window.cc` 全局对象
- **Cocos Creator 3.x**：支持 `window.cc` 全局对象
- **异步加载**：支持 Cocos 引擎异步初始化的情况

### 页面类型兼容

- **单页应用**：支持 SPA 中的动态 Cocos 加载
- **多页应用**：每个页面独立检测
- **iframe 环境**：支持在 iframe 中的 Cocos 应用

## 故障排除

### 常见问题

1. **检测失败但页面有 Cocos**

   - 检查 `window.cc` 是否被其他脚本覆盖
   - 确认 Cocos 引擎是否完全加载
   - 查看控制台日志了解具体原因

2. **延迟检测超时**

   - Cocos 引擎可能加载时间超过 10 秒
   - 可以手动刷新页面重新触发检测
   - 检查网络连接和资源加载情况

3. **误检测**
   - 页面可能定义了假的 `window.cc` 对象
   - 检测逻辑会验证 `cc.director` 的存在来避免误检测

### 调试方法

1. **查看控制台日志**：所有检测过程都有详细日志
2. **手动检测**：在控制台执行 `window.cc` 和 `window.cc.director` 检查
3. **时间分析**：观察日志时间戳了解检测时机

## 未来改进

### 可能的优化

1. **更智能的检测**：检测更多 Cocos 特征对象
2. **用户配置**：允许用户手动启用/禁用检测
3. **检测缓存**：在同一域名下缓存检测结果
4. **动态检测**：监听 Cocos 对象的动态创建
