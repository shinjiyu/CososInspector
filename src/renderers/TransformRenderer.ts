import { HookUIRenderer } from '../hooks/HookUIRenderer';
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
                <div class="property-group-header">
                    <span>Node</span>
                    ${HookUIRenderer.renderHookButtons('active', node)}
                </div>
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
                <div class="property-group-header">
                    <span>Position</span>
                    ${HookUIRenderer.renderHookButtons('position', node)}
                </div>
                <div class="property-row">
                    <div class="property-name">X</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${node.position?.x || 0}" 
                            data-property="position.x">
                        ${HookUIRenderer.renderHookButtons('position.x', node)}
                    </div>
                </div>
                <div class="property-row">
                    <div class="property-name">Y</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${node.position?.y || 0}" 
                            data-property="position.y">
                        ${HookUIRenderer.renderHookButtons('position.y', node)}
                    </div>
                </div>
                <div class="property-row">
                    <div class="property-name">Z</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${node.position?.z || 0}" 
                            data-property="position.z">
                        ${HookUIRenderer.renderHookButtons('position.z', node)}
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
                <div class="property-group-header">
                    <span>Rotation (Euler Angles)</span>
                    ${HookUIRenderer.renderHookButtons('rotation', node)}
                </div>
                <div class="property-row">
                    <div class="property-name">X</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${eulerAngles.x || 0}" 
                            data-property="eulerAngles.x">
                        ${HookUIRenderer.renderHookButtons('rotation.x', node)}
                    </div>
                </div>
                <div class="property-row">
                    <div class="property-name">Y</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${eulerAngles.y || 0}" 
                            data-property="eulerAngles.y">
                        ${HookUIRenderer.renderHookButtons('rotation.y', node)}
                    </div>
                </div>
                <div class="property-row">
                    <div class="property-name">Z</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${eulerAngles.z || 0}" 
                            data-property="eulerAngles.z">
                        ${HookUIRenderer.renderHookButtons('rotation.z', node)}
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
            // 如果是数值，则所有轴使用相同缩放值
            scaleX = scaleY = scaleZ = node.scale;
        } else if (node.scale) {
            // 如果是Vector3对象，分别获取x,y,z值
            scaleX = node.scale.x || 1;
            scaleY = node.scale.y || 1;
            scaleZ = node.scale.z || 1;
        }

        return `
            <div class="property-group">
                <div class="property-group-header">
                    <span>Scale</span>
                    ${HookUIRenderer.renderHookButtons('scale', node)}
                </div>
                <div class="property-row">
                    <div class="property-name">X</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${scaleX}" 
                            data-property="scale.x">
                        ${HookUIRenderer.renderHookButtons('scale.x', node)}
                    </div>
                </div>
                <div class="property-row">
                    <div class="property-name">Y</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${scaleY}" 
                            data-property="scale.y">
                        ${HookUIRenderer.renderHookButtons('scale.y', node)}
                    </div>
                </div>
                <div class="property-row">
                    <div class="property-name">Z</div>
                    <div class="property-value">
                        <input type="number" class="property-input property-number" 
                            value="${scaleZ}" 
                            data-property="scale.z">
                        ${HookUIRenderer.renderHookButtons('scale.z', node)}
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