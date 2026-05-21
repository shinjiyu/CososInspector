const LOG_PREFIX = '[Cocos Inspector 3]';

export function log(message: string, ...args: unknown[]): void {
  console.log(LOG_PREFIX, message, ...args);
}

export function isCocos3(): boolean {
  try {
    const cc = window.cc;
    if (!cc?.director?.getScene) {
      return false;
    }

    const version = String(cc.ENGINE_VERSION ?? '');
    if (version) {
      return version.startsWith('3');
    }

    // 无版本号时：3.x 构建通常暴露 cc.game
    return typeof (cc as { game?: unknown }).game !== 'undefined';
  } catch {
    return false;
  }
}

export function waitForCocos3(
  onReady: () => void,
  maxAttempts = 30,
  intervalMs = 500
): void {
  let attempts = 0;

  const timer = window.setInterval(() => {
    attempts += 1;

    if (isCocos3()) {
      window.clearInterval(timer);
      log('检测到 Cocos Creator 3.x 环境');
      onReady();
      return;
    }

    if (attempts >= maxAttempts) {
      window.clearInterval(timer);
      log('未检测到 Cocos Creator 3.x，扩展不会启动');
    }
  }, intervalMs);
}
