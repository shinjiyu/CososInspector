# FastSpin 游戏引擎分析报告

## 概述

FastSpin 是一个基于 **PixiJS** 的 H5 老虎机游戏框架，具有完整的 Slot 游戏逻辑和动画系统。

## 技术栈

| 技术 | 用途 |
|------|------|
| **PixiJS** | 2D WebGL 渲染引擎 |
| **jQuery 2.2.4** | DOM 操作和 AJAX |
| **GSAP (gsap)** | 高性能补间动画 |
| **Spine (pixi-spine)** | 骨骼动画 |
| **RequireJS** | 模块加载器 |

## 自定义框架 (mm)

FastSpin 封装了一个轻量级的游戏框架 `mm`，类似于 Cocos2d-x 风格：

### 核心类

```javascript
// 类继承系统
mm.Class.extend({
  ctor: function() { },  // 构造函数
  _super: function() { } // 调用父类
});

// 层组件
mm.Layer.extend({
  ctor: function(name) {
    this._super();
    this._node = new PIXI.Container();
  }
});

// 动作系统
mm.Action.extend({
  run: function() { },
  stop: function() { },
  _complete: function() { }
});
```

### 工具方法

| 方法 | 说明 |
|------|------|
| `mm.delay(fn, time)` | 延时执行 |
| `mm.setInterval(fn, time)` | 定时器 |
| `mm.clearInterval(id)` | 清除定时器 |
| `mm.each(arr, fn)` | 遍历数组 |
| `mm.clone(obj)` | 深拷贝对象 |
| `mm.log(...)` | 日志输出 |

## 游戏状态机

### SlotStatus (老虎机状态)

```javascript
SlotStatus = {
  SPIN: 0,          // 旋转中
  RESULT: 1,        // 结果返回
  STOP: 2,          // 停止
  WILD: 3,          // Wild 动画
  WILD_TAKE: 4,     // Wild 收取
  COUNTING: 5,      // 计数中
  TAKE: 6,          // 收取奖励
  WAIT: 7,          // 等待
  RULE_WAIT: 8,     // 规则等待
  NORMAL: 10,       // 正常
  NEXT: 11,         // 下一步
  ULTRA_NORMAL: 12, // Ultra 正常
  ULTRA_SPIN: 13,   // Ultra 旋转
  ULTRA_RESULT: 14, // Ultra 结果
  ULTRA_STOP: 15,   // Ultra 停止
  ULTRA_AGAIN: 16,  // Ultra 重复
  CLEAR: 21         // 清除
}
```

### SlotMode (游戏模式)

```javascript
SlotMode = {
  MAIN: 0,   // 主游戏
  FREE: 1,   // 免费游戏
  BONUS: 2   // 奖励游戏
}
```

## 事件系统

游戏使用命名空间事件系统：

```javascript
Events = {
  ENTER: "events.enter",
  COMPLETE: "events.complete",
  BET: "events.bet",
  NEW_GAME: "events.newgame",
  
  // 转轴事件
  Reels: {
    STOP: "events.reels.stop",
    SINGLE_STOP: "events.reels.single_stop",
    SINGLE_STOP_HIT: "events.reels.single_stop_hit",
    SINGLE_SPIN: "events.reels.single_spin",
    SYMBOL_CLICK: "events.reels.symbol_click",
    MOVE_OVER: "events.reels.move_over",
    PLAY_REEL_HITS: "events.reels.play_reel_hits"
  },
  
  // 控制栏事件
  ControlBar: {
    SPIN: "events.controlbar.spin",
    STOP: "events.controlbar.stop",
    TAKE: "events.controlbar.take",
    ULTRA_START: "events.controlbar.ultrastart",
    // ...
  },
  
  // 购买特性事件
  Buyfeature: {
    BUY: "events.buyfeature.buy",
    SHOW_BOX: "events.buyfeature.show_box",
    HIDE_BOX: "events.buyfeature.hide_box"
  }
}
```

### 全局 Emitter

```javascript
// 创建单例 emitter
emitter = new EventEmitter();

// 使用
emitter.on('event-name', handler, this);
emitter.off('event-name', handler);
emitter.emit('event-name', arg1, arg2);
```

## 核心组件

### 1. BaseMain - 游戏入口

```javascript
BaseMain = mm.Class.extend({
  ctor: function(callback) {
    this._bindPushEvent();  // 绑定推送事件
    this._login();          // 登录
    this._cb = callback;
  },
  
  _login: function() {
    Service.create().login(params, callback);
  },
  
  _initHeartBeat: function() {
    setInterval(() => {
      Service.create().queryTime();
    }, 60000);
  }
});
```

### 2. Reel - 转轴组件

```javascript
Reel = mm.Layer.extend({
  index: null,
  _symbolList: [],
  _isSpin: false,
  
  ctor: function(index, rowNum) {
    this._super("Reel" + index);
    this._bottomContainer = new PIXI.Container();
    this._topContainer = new PIXI.Container();
  },
  
  spin: function(withAnimation) {
    this._isSpin = true;
    this._initMoveTween(withAnimation);
  },
  
  stop: function(result, isSlow) {
    this._result = result;
    this._runStopTween();
  }
});
```

### 3. Symbol - 符号组件

```javascript
Symbol = mm.Layer.extend({
  setData: function(data, isBlur) {
    // 设置符号数据
  },
  
  play: function() {
    // 播放动画
  },
  
  playHit: function() {
    // 播放命中动画
  }
});
```

### 4. Action 系统 - 动作管理

```javascript
// Wild 动画
ActionWild = mm.Action.extend({
  run: function() {
    this._effectPanel.playSymbolAni(this._data.wildWins);
    SoundManager.create().playWild();
  }
});

// 线奖动画
ActionLineWin = mm.Action.extend({
  run: function(loopCount) {
    this._play(loopCount);
    this._scheduler = mm.setInterval(this._play.bind(this), this._subDur * 1000);
  },
  
  _play: function() {
    this._effectPanel.playSymbolAni(item.box);
    this._line.showAni(item.line, item.win);
    SoundManager.create().playPayLine(item);
  }
});
```

## PixiJS 集成

### 滤镜系统

```javascript
UserFilters = {
  getGrayFilter: function() {
    var filter = new PIXI.filters.ColorMatrixFilter();
    filter.matrix = [.3,.6,.1,0,0, .3,.6,.1,0,0, .3,.6,.1,0,0, 0,0,0,1,0];
    return filter;
  },
  
  getInvertFilter: function() {
    // 反色滤镜
  },
  
  getRedFilter: function() {
    // 红色滤镜
  }
}
```

### 图形绘制

```javascript
// 遮罩
_getMask: function() {
  var mask = new PIXI.Graphics();
  mask.beginFill(0xff0000, 0.5);
  mask.drawRect(-width/2, -height/2, width, height);
  mask.endFill();
  return mask;
}
```

## 网络通信 (Service)

```javascript
Service = {
  create: function() {
    return this._instance;
  },
  
  login: function(params, callback) {
    // 登录请求
  },
  
  _Commands: {
    KICK_OUT: 'kickOut',
    EXT_MSG: 'extMsg',
    BONUS_CREDIT: 'bonusCredit',
    INFO_UPDATE: 'infoUpdate',
    BALANCE_UPDATE: 'balanceUpdate'
  },
  
  bindPushEvent: function(cmd, handler, context) {
    // 绑定推送事件
  }
}
```

## 配置系统

```javascript
Config = {
  Symbol: {
    width: 120,
    height: 120,
    gap: 10
  },
  
  Reel: {
    colNum: 5,      // 列数
    rowNum: 3,      // 行数
    maxRowNum: 4,   // 最大行数
    y: 100          // Y 位置
  },
  
  isWays: false,    // 是否使用 Ways 模式
  isBoomGame: false // 是否是消除游戏
}
```

## 音频管理

```javascript
SoundManager = {
  create: function() {
    return this._instance;
  },
  
  playWild: function() { },
  playScatter: function() { },
  playPayLine: function(lineData) { }
}
```

## 文件结构

```
extracted/
├── lib/
│   ├── lib_mm-3cac1de77a.js      # mm 框架核心
│   ├── vendor-legacy-5ceec2ac.js  # 第三方库 (GSAP 等)
│   └── require.min.js             # RequireJS
├── slot/
│   └── slot-d6b7a2a978.js        # 通用 Slot 逻辑 (LZMA 压缩)
├── game/
│   └── game-d7bd12fd2e.js        # 游戏特定逻辑 (LZMA 压缩)
├── other/
│   └── app-24fcedf738.js         # 应用主框架 (jQuery + 游戏框架)
└── component/
    ├── index-legacy-a1792e59.js   # H5 组件
    └── lw-legacy-e7ccb268.js      # 其他组件
```

## 游戏流程

```
1. 初始化
   └── BaseMain.ctor()
       ├── _bindPushEvent()    // 绑定服务器推送
       └── _login()            // 登录获取游戏数据

2. 旋转流程
   └── _spin()
       ├── Service.spin()      // 发送旋转请求
       ├── Reels.spin()        // 开始转轴动画
       └── _onSpinResponse()   // 处理结果
           ├── Reels.stop()    // 停止转轴
           └── _doWinFlow()    // 执行中奖流程

3. 中奖流程
   └── _doWinFlow()
       ├── ActionWild.run()       // Wild 动画
       ├── ActionAllLine.run()    // 全线动画
       ├── ActionLineWin.run()    // 单线动画
       ├── ActionSymbolWin.run()  // 符号动画
       └── _takeWin()             // 收取奖励

4. 免费游戏
   └── _doFreeGame()
       ├── _freeGameTrigger()     // 触发动画
       ├── showFreeGameIntro()    // 显示介绍
       └── _freeGameIntroComplete() // 进入免费游戏
```

## 扩展点

### 自定义符号

```javascript
Symbol.extend({
  _playSymbol: function() {
    // 自定义符号动画
  },
  
  _playWild: function() {
    // 自定义 Wild 动画
  }
});
```

### 自定义游戏流程

```javascript
BaseScene.extend({
  _doWinFlow: function() {
    // 自定义中奖流程
  },
  
  _doFreeGame: function() {
    // 自定义免费游戏
  }
});
```

## 性能优化

1. **对象池** - 符号和特效使用对象池复用
2. **纹理缓存** - 使用 PIXI 纹理缓存
3. **GSAP 动画** - 高性能补间动画
4. **LZMA 压缩** - 代码压缩减少体积

## 总结

FastSpin 是一个成熟的 H5 Slot 游戏框架，基于 PixiJS 构建，具有：

- 完整的类继承系统 (mm.Class)
- 灵活的事件系统 (emitter)
- 状态机驱动的游戏逻辑
- 丰富的动画系统 (GSAP + Spine)
- 模块化的代码结构
