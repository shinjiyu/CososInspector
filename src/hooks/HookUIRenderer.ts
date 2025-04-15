import { PROPERTY_HOOK_MAPPINGS } from './HookConfig';
import { HookManager } from './HookManager';

/**
 * 钩子UI渲染器 - 负责渲染钩子按钮
 */
export class HookUIRenderer {
    /**
     * 渲染钩子按钮
     * @param propKey 属性键
     * @param node 节点
     */
    public static renderHookButtons(propKey: string, node: cc.Node): string {
        const hookManager = HookManager.getInstance();
        const config = PROPERTY_HOOK_MAPPINGS[propKey];

        if (!config) return '';

        const isGetHooked = hookManager.isHooked(node.uuid, propKey, 'get');
        const isSetHooked = hookManager.isHooked(node.uuid, propKey, 'set');

        // 检查是否是数组索引钩子
        const isArrayIndexHook = config.arrayIndex !== undefined;

        // 根据不同类型的钩子提供不同的按钮文本和颜色
        const getButtonLabel = isArrayIndexHook ? "读" : "钩读";
        const setButtonLabel = isArrayIndexHook ? "写" : "钩写";

        return `
            <div class="hook-buttons">
                <button class="hook-btn hook-get-btn ${isGetHooked ? 'active' : ''}" 
                        data-hook-type="get" 
                        data-prop-key="${propKey}"
                        data-array-index="${config.arrayIndex || ''}"
                        title="在读取${config.uiName}属性时触发断点">
                    ${getButtonLabel}
                </button>
                <button class="hook-btn hook-set-btn ${isSetHooked ? 'active' : ''}" 
                        data-hook-type="set"
                        data-prop-key="${propKey}"
                        data-array-index="${config.arrayIndex || ''}"
                        title="在修改${config.uiName}属性时触发断点">
                    ${setButtonLabel}
                </button>
            </div>
        `;
    }

    /**
     * 初始化钩子按钮点击事件监听
     * @param container 容器元素
     * @param getSelectedNode 获取当前选中节点的函数
     */
    public static initHookButtonListeners(container: HTMLElement, getSelectedNode: () => cc.Node | null): void {
        container.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (!target.classList.contains('hook-btn')) return;

            const propKey = target.dataset.propKey;
            const hookType = target.dataset.hookType as 'get' | 'set';
            const node = getSelectedNode();

            if (!propKey || !hookType || !node) return;

            const hookManager = HookManager.getInstance();

            if (target.classList.contains('active')) {
                // 移除hook
                hookManager.removeHook(node, propKey, hookType);
                target.classList.remove('active');
            } else {
                // 对于读钩子，显示确认对话框
                if (hookType === 'get') {
                    this.showReadHookConfirmation(node, propKey, target);
                } else {
                    // 直接添加写钩子
                    hookManager.addHook(node, propKey, hookType);
                    target.classList.add('active');
                }
            }
        });
    }

    /**
     * 显示读钩子确认对话框
     * @param node 节点
     * @param propKey 属性键
     * @param buttonElement 按钮元素
     */
    private static showReadHookConfirmation(node: cc.Node, propKey: string, buttonElement: HTMLElement): void {
        // 移除现有对话框
        const existingDialog = document.getElementById('hook-confirmation-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        // 获取属性配置
        const config = PROPERTY_HOOK_MAPPINGS[propKey];
        if (!config) return;

        // 创建对话框
        const dialog = document.createElement('div');
        dialog.id = 'hook-confirmation-dialog';
        dialog.className = 'hook-confirmation-dialog';

        // 设置对话框内容
        const isArrayIndexHook = config.arrayIndex !== undefined;
        const hookTarget = isArrayIndexHook ?
            `${config.uiName}(索引 ${config.arrayIndex})` : config.uiName;

        dialog.innerHTML = `
            <div class="dialog-header">
                <h3>读钩子警告</h3>
                <button class="dialog-close-btn">&times;</button>
            </div>
            <div class="dialog-content">
                <p class="warning-text">警告：读钩子可能会在短时间内触发非常多次，导致性能下降!</p>
                <p>确定要为 <strong>${hookTarget}</strong> 添加读钩子吗？</p>
                <p>节点: <strong>${node.name}(${node.uuid})</strong></p>
            </div>
            <div class="dialog-actions">
                <button class="dialog-btn dialog-cancel-btn">取消</button>
                <button class="dialog-btn dialog-confirm-btn">确认添加</button>
            </div>
        `;

        // 添加到页面
        document.body.appendChild(dialog);

        // 添加事件监听
        const closeBtn = dialog.querySelector('.dialog-close-btn');
        const cancelBtn = dialog.querySelector('.dialog-cancel-btn');
        const confirmBtn = dialog.querySelector('.dialog-confirm-btn');

        // 关闭对话框的函数
        const closeDialog = () => {
            dialog.remove();
        };

        // 确认添加钩子的函数
        const confirmAddHook = () => {
            const hookManager = HookManager.getInstance();
            hookManager.addHook(node, propKey, 'get');
            buttonElement.classList.add('active');
            closeDialog();
        };

        // 添加事件监听
        closeBtn?.addEventListener('click', closeDialog);
        cancelBtn?.addEventListener('click', closeDialog);
        confirmBtn?.addEventListener('click', confirmAddHook);

        // 点击对话框外部关闭
        document.addEventListener('click', (e) => {
            if (e.target === dialog) {
                closeDialog();
            }
        }, { once: true });
    }
} 