/**
 * 示例：由 Cocos Inspector「还原 TS」生成的草稿形态
 * 字段来自运行时 Canvas/MainController 实例（非仓库内真实提取）
 * 实际使用请在游戏页选中 Canvas → 点击 MainController 旁「还原 TS」
 */
import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('MainController')
export class MainController extends Component {
  @property
  wssCacert: string = 'cacert';

  @property
  width: number = 1280;

  @property
  height: number = 720;

  @property
  orientation: number = 0;

  @property
  isLockDirection: boolean = true;

  @property
  debugView: Node = null;

  @property
  viewMode: string = 'landscape';
}
