import { ComponentRenderer } from '../types/components';
import { DefaultRenderer } from './DefaultRenderer';
import { TransformRenderer } from './TransformRenderer';

/**
 * 渲染器管理器 - 负责管理和提供组件渲染器
 */
export class RendererManager {
    private renderers: ComponentRenderer[] = [];
    private defaultRenderer: DefaultRenderer;

    constructor() {
        // 注册默认渲染器
        this.defaultRenderer = new DefaultRenderer();

        // 注册自定义渲染器
        this.registerRenderer(new TransformRenderer());

        // 这里可以注册更多的渲染器
        // this.registerRenderer(new SpriteRenderer());
        // this.registerRenderer(new LabelRenderer());
        // 等等...
    }

    /**
     * 注册一个组件渲染器
     */
    registerRenderer(renderer: ComponentRenderer): void {
        this.renderers.push(renderer);
    }

    /**
     * 为指定组件查找合适的渲染器
     */
    getRendererFor(component: cc.Component): ComponentRenderer {
        // 查找第一个可以渲染该组件的渲染器
        for (const renderer of this.renderers) {
            if (renderer.canRender(component)) {
                return renderer;
            }
        }

        // 如果没有找到，返回默认渲染器
        return this.defaultRenderer;
    }

    /**
     * 渲染组件列表
     */
    renderComponents(components: cc.Component[]): string {
        if (!components || components.length === 0) {
            return '<div class="no-selection">请在左侧选择一个节点</div>';
        }

        let html = '<div class="component-list">';

        // 渲染每个组件
        components.forEach(component => {
            const renderer = this.getRendererFor(component);
            html += renderer.render(component);
        });

        html += '</div>';
        return html;
    }
} 