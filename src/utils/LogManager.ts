/**
 * 日志管理器
 * 提供统一的日志记录接口，支持不同级别的日志控制
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4
}

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

const DEFAULT_SETTINGS: LogSettings = {
    currentLevel: LogLevel.DEBUG,
    levelEnabled: {
        [LogLevel.DEBUG]: true,
        [LogLevel.INFO]: true,
        [LogLevel.WARN]: true,
        [LogLevel.ERROR]: true,
        [LogLevel.NONE]: false
    }
};

export class LogManager {
    private static instance: LogManager;
    private currentLevel: LogLevel;
    private levelEnabled: { [key in LogLevel]: boolean };
    private readonly STORAGE_KEY = 'cocos-inspector-log-settings';

    private constructor() {
        // 从localStorage加载设置，如果没有则使用默认设置
        const savedSettings = this.loadSettings();
        this.currentLevel = savedSettings.currentLevel;
        this.levelEnabled = savedSettings.levelEnabled;
    }

    static getInstance(): LogManager {
        if (!LogManager.instance) {
            LogManager.instance = new LogManager();
        }
        return LogManager.instance;
    }

    private loadSettings(): LogSettings {
        try {
            const savedSettings = localStorage.getItem(this.STORAGE_KEY);
            if (savedSettings) {
                const settings = JSON.parse(savedSettings);
                // 验证设置的完整性
                if (this.isValidSettings(settings)) {
                    return settings;
                }
            }
        } catch (e) {
            console.error('Failed to load log settings:', e);
        }
        return DEFAULT_SETTINGS;
    }

    private isValidSettings(settings: any): settings is LogSettings {
        return (
            settings &&
            typeof settings.currentLevel === 'number' &&
            settings.currentLevel >= 0 &&
            settings.currentLevel <= 4 &&
            settings.levelEnabled &&
            typeof settings.levelEnabled === 'object' &&
            Object.keys(settings.levelEnabled).length === 5
        );
    }

    private saveSettings(): void {
        try {
            const settings: LogSettings = {
                currentLevel: this.currentLevel,
                levelEnabled: this.levelEnabled
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
        } catch (e) {
            console.error('Failed to save log settings:', e);
        }
    }

    private formatMessage(level: string, message: string, params?: LogParams): string {
        const timestamp = new Date().toISOString();
        let extraInfo = '';

        if (params) {
            if ('name' in params && 'uuid' in params) {
                // NodeInfo
                extraInfo = params.name && params.uuid ? ` [${params.name}(${params.uuid})]` : '';
            } else if ('error' in params) {
                // ErrorInfo
                extraInfo = ` [Error: ${params.error}]`;
            }
        }

        return `[${timestamp}][${level}]${extraInfo} ${message}`;
    }

    private log(level: LogLevel, levelStr: string, message: string, params?: LogParams): void {
        if (level >= this.currentLevel && this.levelEnabled[level]) {
            const formattedMessage = this.formatMessage(levelStr, message, params);
            switch (level) {
                case LogLevel.DEBUG:
                    console.debug(formattedMessage);
                    break;
                case LogLevel.INFO:
                    console.info(formattedMessage);
                    break;
                case LogLevel.WARN:
                    console.warn(formattedMessage);
                    break;
                case LogLevel.ERROR:
                    console.error(formattedMessage);
                    break;
            }
        }
    }

    debug(message: string, params?: LogParams): void {
        this.log(LogLevel.DEBUG, 'DEBUG', message, params);
    }

    info(message: string, params?: LogParams): void {
        this.log(LogLevel.INFO, 'INFO', message, params);
    }

    warn(message: string, params?: LogParams): void {
        this.log(LogLevel.WARN, 'WARN', message, params);
    }

    error(message: string, params?: LogParams): void {
        this.log(LogLevel.ERROR, 'ERROR', message, params);
    }

    setLevel(level: LogLevel): void {
        this.currentLevel = level;
        this.saveSettings();
    }

    enableLevel(level: LogLevel): void {
        if (level in this.levelEnabled) {
            this.levelEnabled[level] = true;
            this.saveSettings();
        }
    }

    disableLevel(level: LogLevel): void {
        if (level in this.levelEnabled) {
            this.levelEnabled[level] = false;
            this.saveSettings();
        }
    }

    /**
     * 获取当前日志级别
     */
    getCurrentLevel(): LogLevel {
        return this.currentLevel;
    }

    /**
     * 检查指定日志级别是否启用
     */
    isLevelEnabled(level: LogLevel): boolean {
        return this.levelEnabled[level];
    }

    /**
     * 重置所有设置为默认值
     */
    resetSettings(): void {
        this.currentLevel = DEFAULT_SETTINGS.currentLevel;
        this.levelEnabled = { ...DEFAULT_SETTINGS.levelEnabled };
        this.saveSettings();
    }

    /**
     * 获取当前所有设置
     */
    getSettings(): LogSettings {
        return {
            currentLevel: this.currentLevel,
            levelEnabled: { ...this.levelEnabled }
        };
    }
} 