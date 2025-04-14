import { ComponentRenderer } from '../types/components';

/**
 * 默认组件渲染器 - 用于渲染所有没有专门渲染器的组件
 */
export class DefaultRenderer implements ComponentRenderer {
    canRender(component: cc.Component): boolean {
        // 默认渲染器可以渲染任何组件
        return true;
    }

    render(component: cc.Component): string {
        const componentName = component.constructor.name || 'Component';

        // 收集所有公开属性
        const properties = this.getComponentProperties(component);

        // 构建属性行
        let propertiesHTML = '';
        if (properties.length > 0) {
            properties.forEach(prop => {
                const value = (component as any)[prop];
                propertiesHTML += this.renderProperty(prop, value);
            });
        } else {
            propertiesHTML = '<div class="no-properties">没有可显示的属性</div>';
        }

        // 构建组件HTML
        return `
            <div class="component-item" data-component-id="${component.uuid}">
                <div class="component-header">
                    <div class="component-name">${componentName}</div>
                    <div class="component-toggle">▼</div>
                </div>
                <div class="component-content">
                    ${propertiesHTML}
                </div>
            </div>
        `;
    }

    private getComponentProperties(component: cc.Component): string[] {
        const properties: string[] = [];

        // 获取组件所有属性
        for (const key in component) {
            // 排除私有属性、函数和系统属性
            if (key.startsWith('_') || typeof (component as any)[key] === 'function' || this.isSystemProperty(key)) {
                continue;
            }

            properties.push(key);
        }

        return properties;
    }

    private isSystemProperty(key: string): boolean {
        // 排除一些系统属性
        const systemProps = [
            'uuid', 'node', 'enabled', 'enabledInHierarchy',
            '__proto__', 'constructor', 'isValid'
        ];
        return systemProps.includes(key);
    }

    private renderProperty(name: string, value: any): string {
        let valueHTML = '';

        // 根据值类型渲染不同的控件
        if (value === null || value === undefined) {
            valueHTML = '<span class="property-null">null</span>';
        } else if (typeof value === 'boolean') {
            valueHTML = `<input type="checkbox" class="property-checkbox" ${value ? 'checked' : ''} readonly>`;
        } else if (typeof value === 'number') {
            valueHTML = `<input type="text" class="property-input property-number" value="${value}" readonly>`;
        } else if (typeof value === 'string') {
            valueHTML = `<input type="text" class="property-input" value="${this.escapeHTML(value)}" readonly>`;
        } else if (value && value.constructor && value.constructor.name === 'Vec2') {
            valueHTML = `
                <div class="vector-inputs">
                    <div class="vector-input">
                        <span class="vector-input-label">X</span>
                        <input type="text" class="property-input property-number" value="${value.x}" readonly>
                    </div>
                    <div class="vector-input">
                        <span class="vector-input-label">Y</span>
                        <input type="text" class="property-input property-number" value="${value.y}" readonly>
                    </div>
                </div>
            `;
        } else if (value && value.constructor && value.constructor.name === 'Vec3') {
            valueHTML = `
                <div class="vector-inputs">
                    <div class="vector-input">
                        <span class="vector-input-label">X</span>
                        <input type="text" class="property-input property-number" value="${value.x}" readonly>
                    </div>
                    <div class="vector-input">
                        <span class="vector-input-label">Y</span>
                        <input type="text" class="property-input property-number" value="${value.y}" readonly>
                    </div>
                    <div class="vector-input">
                        <span class="vector-input-label">Z</span>
                        <input type="text" class="property-input property-number" value="${value.z}" readonly>
                    </div>
                </div>
            `;
        } else if (value && value.constructor && value.constructor.name === 'Color') {
            const r = Math.floor(value.r * 255);
            const g = Math.floor(value.g * 255);
            const b = Math.floor(value.b * 255);
            const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            valueHTML = `
                <div class="color-preview" style="background-color: ${hexColor}"></div>
                <input type="text" class="property-input" value="${hexColor}" readonly>
            `;
        } else if (value && value instanceof Object && value.name && value.constructor && value.constructor.name === 'Node') {
            valueHTML = `<div class="node-reference">${value.name} (Node)</div>`;
        } else if (typeof value === 'object') {
            valueHTML = `<div class="object-preview">${this.getObjectPreview(value)}</div>`;
        } else {
            valueHTML = `<span>${this.escapeHTML(String(value))}</span>`;
        }

        // 构建属性行
        return `
            <div class="property-row">
                <div class="property-name">${name}</div>
                <div class="property-value">${valueHTML}</div>
            </div>
        `;
    }

    private getObjectPreview(obj: any): string {
        if (obj === null) return 'null';
        if (obj === undefined) return 'undefined';

        if (Array.isArray(obj)) {
            return `Array(${obj.length})`;
        }

        const type = obj.constructor ? obj.constructor.name : 'Object';
        return type;
    }

    private escapeHTML(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
} 