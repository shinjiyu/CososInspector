import { ComponentRenderer } from '../types/components';

/**
 * Transform组件渲染器 - 用于渲染Transform组件并支持编辑
 */
export class TransformRenderer implements ComponentRenderer {
    canRender(component: cc.Component): boolean {
        // 只渲染Transform组件
        return component.constructor.name === 'Transform';
    }

    render(component: cc.Component): string {
        const node = component.node;
        if (!node) {
            return '<div class="error-message">无法找到节点</div>';
        }

        return `
            <div class="component-item" data-component-id="${component.uuid}">
                <div class="component-header">
                    <div class="component-name">Transform</div>
                    <div class="component-toggle">▼</div>
                </div>
                <div class="component-content">
                    ${this.hasActiveProperty(node) ? this.renderActiveProperty(node) : ''}
                    ${this.hasPositionProperty(node) ? this.renderPositionProperty(node) : ''}
                    ${this.hasRotationProperty(node) ? this.renderRotationProperty(node) : ''}
                    ${this.hasScaleProperty(node) ? this.renderScaleProperty(node) : ''}
                </div>
            </div>
        `;
    }

    public renderActiveProperty(node: cc.Node): string {
        // 检查节点是否有active属性
        const hasActiveProperty = 'active' in node;
        const nodeName = node.name || '未命名';
        const isActive = node === cc.director.getScene() ? true : node.active || false;

        return `
            <div class="property-group">
                <div class="property-group-header">Node</div>
                ${hasActiveProperty ? `
                <div class="property-row">
                    <div class="property-name">Active</div>
                    <div class="property-value">
                        <input type="checkbox" class="property-checkbox" 
                            ${isActive ? 'checked' : ''} 
                            data-property="active">
                        <span class="active-indicator ${isActive ? 'active' : 'inactive'}">
                            ${isActive ? '已激活' : '已禁用'}
                        </span>
                    </div>
                </div>` : ''}
                <div class="property-row">
                    <div class="property-name">Name</div>
                    <div class="property-value">
                        <input type="text" class="property-input" 
                            value="${nodeName}" 
                            data-property="name">
                    </div>
                </div>
                <div class="property-row">
                    <div class="property-name">UUID</div>
                    <div class="property-value">
                        <input type="text" class="property-input" 
                            value="${node.uuid || ''}" 
                            readonly>
                    </div>
                </div>
            </div>
        `;
    }

    public renderPositionProperty(node: cc.Node): string {
        return `
            <div class="property-group">
                <div class="property-group-header">Position</div>
                <div class="property-row">
                    <div class="property-name">X</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${node.position?.x || 0}" 
                            data-property="position.x">
                    </div>
                </div>
                <div class="property-row">
                    <div class="property-name">Y</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${node.position?.y || 0}" 
                            data-property="position.y">
                    </div>
                </div>
                <div class="property-row">
                    <div class="property-name">Z</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${node.position?.z || 0}" 
                            data-property="position.z">
                    </div>
                </div>
            </div>
        `;
    }

    public renderRotationProperty(node: cc.Node): string {
        // Use eulerAngles for rotation display
        const eulerAngles = node.eulerAngles || { x: 0, y: 0, z: 0 };

        return `
            <div class="property-group">
                <div class="property-group-header">Rotation (Euler Angles)</div>
                <div class="property-row">
                    <div class="property-name">X</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${eulerAngles.x || 0}" 
                            data-property="eulerAngles.x">
                    </div>
                </div>
                <div class="property-row">
                    <div class="property-name">Y</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${eulerAngles.y || 0}" 
                            data-property="eulerAngles.y">
                    </div>
                </div>
                <div class="property-row">
                    <div class="property-name">Z</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${eulerAngles.z || 0}" 
                            data-property="eulerAngles.z">
                    </div>
                </div>
            </div>
        `;
    }

    public renderScaleProperty(node: cc.Node): string {
        // 处理 scale 属性可能是 number 或 Vector3 类型的情况
        let scaleX = 1;
        let scaleY = 1;
        let scaleZ = 1;

        if (typeof node.scale === 'number') {
            // 如果 scale 是数字，则 X/Y/Z 都使用相同的值
            scaleX = scaleY = scaleZ = node.scale;
        } else if (node.scale) {
            // 如果 scale 是 Vector3 对象
            scaleX = node.scale.x || 1;
            scaleY = node.scale.y || 1;
            scaleZ = node.scale.z || 1;
        } else {
            // 如果 scale 未定义，尝试使用单独的 scaleX/Y/Z 属性
            scaleX = node.scaleX ?? 1;
            scaleY = node.scaleY ?? 1;
            scaleZ = node.scaleZ ?? 1;
        }

        return `
            <div class="property-group">
                <div class="property-group-header">Scale</div>
                <div class="property-row">
                    <div class="property-name">X</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${scaleX}" 
                            data-property="scale.x">
                    </div>
                </div>
                <div class="property-row">
                    <div class="property-name">Y</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${scaleY}" 
                            data-property="scale.y">
                    </div>
                </div>
                <div class="property-row">
                    <div class="property-name">Z</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${scaleZ}" 
                            data-property="scale.z">
                    </div>
                </div>
            </div>
        `;
    }

    private hasActiveProperty(node: cc.Node): boolean {
        return 'active' in node;
    }
    // 检查节点是否有位置相关属性
    private hasPositionProperty(node: cc.Node): boolean {
        return node.position !== undefined ||
            node.x !== undefined ||
            node.y !== undefined;
    }

    // 检查节点是否有旋转相关属性
    private hasRotationProperty(node: cc.Node): boolean {
        return node.rotation !== undefined ||
            node.angle !== undefined ||
            node.eulerAngles !== undefined;
    }

    // 检查节点是否有缩放相关属性
    private hasScaleProperty(node: cc.Node): boolean {
        return node.scale !== undefined ||
            node.scaleX !== undefined ||
            node.scaleY !== undefined;
    }
} 