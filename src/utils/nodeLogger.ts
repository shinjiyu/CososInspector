import { log } from './log';

interface NodeInfo {
    name?: string;
    uuid?: string;
}

/**
 * 创建节点信息对象
 */
export function createNodeInfo(node: any): NodeInfo {
    return {
        name: node?.name,
        uuid: node?.uuid
    };
}

/**
 * 记录调试日志
 */
export function logDebug(message: string, node?: any): void {
    log.debug(message, node ? createNodeInfo(node) : undefined);
}

/**
 * 记录信息日志
 */
export function logInfo(message: string, node?: any): void {
    log.info(message, node ? createNodeInfo(node) : undefined);
}

/**
 * 记录警告日志
 */
export function logWarn(message: string, node?: any): void {
    log.warn(message, node ? createNodeInfo(node) : undefined);
}

/**
 * 记录错误日志
 */
export function logError(message: string, error?: any, node?: any): void {
    if (error) {
        log.error(message, { error });
    } else {
        log.error(message, node ? createNodeInfo(node) : undefined);
    }
}

/**
 * 记录节点相关的错误日志
 */
export function logNodeError(message: string, node: any, error: any): void {
    const nodeInfo = createNodeInfo(node);
    log.error(`${message}, 节点: ${nodeInfo.name}(${nodeInfo.uuid})`, { error });
} 