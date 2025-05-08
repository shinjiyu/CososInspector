import { LogLevel, LogManager } from './LogManager';

interface NodeInfo {
    name?: string;
    uuid?: string;
}

interface ErrorInfo {
    error: any;
}

type LogParams = NodeInfo | ErrorInfo;

interface LogSettings {
    currentLevel: LogLevel;
    levelEnabled: { [key in LogLevel]: boolean };
}

const logger = LogManager.getInstance();

export const log = {
    debug: (message: string, params?: LogParams) => logger.debug(message, params),
    info: (message: string, params?: LogParams) => logger.info(message, params),
    warn: (message: string, params?: LogParams) => logger.warn(message, params),
    error: (message: string, params?: LogParams) => logger.error(message, params),
    setLevel: (level: LogLevel) => logger.setLevel(level),
    enableLevel: (level: LogLevel) => logger.enableLevel(level),
    disableLevel: (level: LogLevel) => logger.disableLevel(level),
    getCurrentLevel: () => logger.getCurrentLevel(),
    isLevelEnabled: (level: LogLevel) => logger.isLevelEnabled(level),
    resetSettings: () => logger.resetSettings(),
    getSettings: () => logger.getSettings()
};

export { LogLevel } from './LogManager';

