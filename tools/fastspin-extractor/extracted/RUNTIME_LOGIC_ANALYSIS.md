# FastSpin 运行时逻辑详细分析

## 一、游戏生命周期

### 1. 初始化阶段

```
┌─────────────────────────────────────────────────────────────────┐
│                        游戏启动流程                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   HTML 加载                                                      │
│       ↓                                                         │
│   RequireJS 加载模块                                             │
│       ↓                                                         │
│   BaseMain.ctor()                                               │
│       ├── _bindPushEvent()  // 绑定服务器推送事件                  │
│       │     ├── KICK_OUT    // 踢出                             │
│       │     ├── EXT_MSG     // 扩展消息                          │
│       │     ├── BONUS_CREDIT // 奖励金额                         │
│       │     ├── INFO_UPDATE  // 信息更新                         │
│       │     └── BALANCE_UPDATE // 余额更新                       │
│       │                                                         │
│       └── _login()          // 登录                             │
│             ├── Service.login(params, callback)                 │
│             ├── 设置 lobbyUrl, backHome, etc.                   │
│             ├── _initAcct(acct)   // 初始化账户                  │
│             ├── _initHeartBeat()  // 启动心跳 (60秒)             │
│             └── callback()        // 进入游戏                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. 游戏场景初始化

```javascript
// BaseGameManager 初始化
BaseGameManager.ctor(config) {
  this._data = {};
  
  // 绑定组件引用
  this._scene = config.scene;
  this._background = config.background;
  this._reels = config.reels;
  this._effectPanel = config.effectPanel;
  this._controlBar = config.controlBar;
  this._freeGame = config.freeGame;
  this._line = config.line;
  this._bigWinPanel = config.bigWinPanel;
  
  // 绑定事件
  this._initActionBefore();
  this._initActionWin();
  
  // 恢复上次状态
  this._initResumeBefore();
}
```

## 二、状态机详解

### SlotStatus 状态转换图

```
┌─────────────────────────────────────────────────────────────────┐
│                        状态转换图                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   NORMAL (10) ──[点击SPIN]──→ SPIN (0)                          │
│       ↑                          ↓                              │
│       │                    [收到服务器响应]                       │
│       │                          ↓                              │
│       │                     RESULT (1)                          │
│       │                          ↓                              │
│       │                    [转轴停止]                            │
│       │                          ↓                              │
│       │                      STOP (2)                           │
│       │                          ↓                              │
│       │                    [有Wild动画?]                         │
│       │                      ↙     ↘                            │
│       │                是 ↓          ↓ 否                        │
│       │              WILD (3)        │                          │
│       │                 ↓            │                          │
│       │           WILD_TAKE (4)      │                          │
│       │                 ↓            │                          │
│       │                 └─────┬──────┘                          │
│       │                       ↓                                 │
│       │                    [有奖?]                               │
│       │                   ↙     ↘                               │
│       │               是 ↓         ↓ 否                          │
│       │          COUNTING (5)      │                            │
│       │               ↓            │                            │
│       │            TAKE (6)        │                            │
│       │               ↓            │                            │
│       │               └─────┬──────┘                            │
│       │                     ↓                                   │
│       │              [有免费游戏?]                               │
│       │                ↙       ↘                                │
│       │            是 ↓           ↓ 否                           │
│       │         WAIT (7)     CLEAR (21)                         │
│       │            ↓              ↓                             │
│       │    [进入FreeGame]   [更新余额]                            │
│       │            ↓              ↓                             │
│       └────────────┴──────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### SlotStatus 代码对应

```javascript
SlotStatus = {
  SPIN: 0,          // 转轴旋转中
  RESULT: 1,        // 收到服务器结果
  STOP: 2,          // 转轴停止
  WILD: 3,          // Wild 动画播放中
  WILD_TAKE: 4,     // Wild 收取动画
  COUNTING: 5,      // 奖金计数中
  TAKE: 6,          // 收取奖金
  WAIT: 7,          // 等待（如等待玩家操作）
  RULE_WAIT: 8,     // 规则等待
  NORMAL: 10,       // 正常待机状态
  NEXT: 11,         // 下一步
  ULTRA_NORMAL: 12, // Ultra模式正常
  ULTRA_SPIN: 13,   // Ultra模式旋转
  ULTRA_RESULT: 14, // Ultra模式结果
  ULTRA_STOP: 15,   // Ultra模式停止
  ULTRA_AGAIN: 16,  // Ultra模式重复
  CLEAR: 21         // 清除/重置
}
```

## 三、旋转流程详解

### 1. 完整旋转流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        旋转流程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [用户点击 SPIN 按钮]                                            │
│           ↓                                                     │
│  ControlBar._onSpin()                                           │
│           ↓                                                     │
│  检查状态: slotStatus >= NORMAL?                                 │
│           ↓ (是)                                                │
│  检查余额: balance >= totalBet?                                  │
│           ↓ (是)                                                │
│  GameManager._spin()                                            │
│     ├── _reset()              // 重置数据                       │
│     ├── _reels.spin(isTurbo)  // 开始转轴动画                    │
│     └── _spinRequest()        // 发送旋转请求                    │
│           ↓                                                     │
│  setSlotStatus(SPIN)                                            │
│           ↓                                                     │
│  Service.spin(params, callback)                                 │
│           ↓ (异步)                                              │
│  [服务器返回结果]                                                │
│           ↓                                                     │
│  _onSpinResponse(response)                                      │
│     ├── _resetData(response)  // 解析数据                       │
│     │     ├── 处理 symbol 数组                                  │
│     │     ├── 处理 lineWins                                     │
│     │     ├── 处理 symbolWins                                   │
│     │     └── 处理 freeGame/bonusGame                           │
│     │                                                           │
│     ├── setSlotStatus(RESULT)                                   │
│     └── _reels.stop(data)     // 设置停止数据                   │
│           ↓                                                     │
│  [等待转轴逐个停止]                                              │
│           ↓                                                     │
│  _onReelStop() // 所有转轴停止                                   │
│           ↓                                                     │
│  setSlotStatus(STOP)                                            │
│           ↓                                                     │
│  _doWinFlow() 或 _doGameFlow()                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. _spin 函数详解

```javascript
_spin: function() {
  // 1. 状态检查
  if (spade.betInfo.slotStatus < SlotStatus.NORMAL) {
    return false;
  }
  
  // 2. 余额检查（非免费游戏时）
  if (!this._data.isFree && !spade.content.luckyId) {
    if (spade.betInfo.totalBet > mm.parseFloat(spade.content.balance)) {
      emitter.emit(TransformEventName.ShowBalanceInsufficientTip);
      this._controlBar.setSlotStatus(SlotStatus.CLEAR);
      return false;
    }
  }
  
  // 3. 重置状态
  this._reset();
  
  // 4. 开始转轴动画
  this._reels.spin(spade.betInfo.isTurbo);
  
  // 5. 发送旋转请求
  if (this._freeSpinResults && this._freeSpinResults.length) {
    // 使用缓存的免费旋转结果
    var result = this._freeSpinResults.shift();
    this._onSpinResponse(result);
  } else {
    this._spinRequest();
  }
  
  return true;
}
```

### 3. 旋转请求参数

```javascript
_spinRequestReq: function() {
  var betInfo = spade.betInfo;
  var params = {};
  
  // 根据协议版本选择参数名
  if (Service._SlotCommands.GAME_START >= 500) {
    params.lineBetAmt = betInfo.unit;
  } else {
    params.unit = betInfo.unit;
  }
  
  params.credit = betInfo.credit;      // 每线下注
  params.line = betInfo.line;          // 线数
  params.domination = betInfo.dom;     // 币种
  params.gameCode = betInfo.gameCode;  // 游戏代码
  params.totalBet = betInfo.totalBet;  // 总下注
  params.freeSpin = this._data.freeInfo ? 
                    this._data.freeInfo.totalSpin : 0;
  
  // Lucky spin ID
  if (spade.content.luckyId) {
    params.luckyId = spade.content.luckyId;
  }
  
  // 配置代码（Turbo 等）
  var configCode = this._getConfigCode();
  if (this._hasConfigCodeChanged(configCode)) {
    spade.betInfo.configCode = configCode;
    params.configCode = configCode;
  }
  
  return params;
}
```

## 四、转轴动画系统

### 1. Reel 组件结构

```javascript
Reel = mm.Layer.extend({
  index: null,           // 轴索引 (0-4)
  _symbolList: [],       // 符号列表
  _isSpin: false,        // 是否旋转中
  _isStop: false,        // 是否停止中
  _result: null,         // 停止结果
  _rowNum: 3,            // 行数
  _moveSpeed: 0.1,       // 移动速度
  
  // GSAP 时间线
  _tlMove: null,         // 移动动画
  _tlStop: null,         // 停止动画
  _tlStopSlow: null,     // 慢停动画
  
  // 容器
  _bottomContainer: null,      // 底层容器（普通符号）
  _topContainer: null,         // 顶层容器（特殊符号）
  _moveContainer: null,        // 移动容器
  _moveContainerTop: null,     // 移动容器（顶层）
});
```

### 2. 旋转动画流程

```javascript
spin: function(withAnimation) {
  if (this._isSpin) return;
  
  this._stopCount = 0;
  this._isSpin = true;
  this._isStopHit = false;
  this._isStopEnd = false;
  
  // 重置符号
  this._reset();
  
  // 初始化移动动画
  this._initMoveTween(withAnimation);
  
  this._newSymbolList = [];
}

_initMoveTween: function(withAnimation) {
  this._first = true;
  var container = this._moveContainer;
  var containerTop = this._moveContainerTop;
  var symbolHeight = Config.Symbol.height;
  
  this._attr = { y: this._defaultY };
  
  this._tlMove = gsap.timeline()
    .set(this._attr, { y: this._defaultY })
    .set(container, { y: this._defaultY })
    .set(containerTop, { y: this._defaultY });
  
  if (withAnimation) {
    // 带弹性的启动动画
    this._tlMove.to(this._attr, {
      y: this._defaultY - 30,
      duration: 0.2,
      ease: "power1.out",
      onStart: this._onStep0.bind(this),
      onUpdate: function() {
        container.y = this._attr.y;
        containerTop.y = this._attr.y;
      }.bind(this),
      onComplete: function() {
        this._onStep1();
        this._dispatch(Events.Reels.SINGLE_SPIN, this);
      }.bind(this)
    });
  }
  
  // 循环移动动画
  this._tlMove
    .to(this._attr, {
      duration: this._moveSpeed,
      y: this._defaultY + symbolHeight,
      repeat: -1,
      ease: "none",
      onUpdate: function() {
        container.y = this._attr.y;
        containerTop.y = this._attr.y;
      }.bind(this),
      onRepeat: this._onLoop.bind(this)
    });
}
```

### 3. 停止动画流程

```javascript
stop: function(result, isSlow) {
  if (!this._isSpin || this._isStop) return;
  
  this._isStop = true;
  this._result = result;
  
  // 设置结果符号
  this._setResult();
  
  // 停止移动动画
  if (this._tlMove) {
    this._tlMove.kill();
    this._tlMove = null;
  }
  
  // 根据是否慢停选择动画
  if (isSlow) {
    this._runStopSlowTween();
  } else {
    this._runStopTween();
  }
}

_runStopTween: function() {
  var attr = { y: this._moveContainer.y };
  
  gsap.timeline()
    .to(attr, {
      y: 0,
      duration: 0.3,
      ease: "back.out(1.5)",  // 弹性效果
      onStart: this._onStep2.bind(this),
      onUpdate: function() {
        this._moveContainer.y = attr.y;
        this._moveContainerTop.y = attr.y;
      }.bind(this),
      onComplete: function() {
        this._onStep3();
        this._onStopHit();
        this._onStop();
      }.bind(this)
    });
}
```

## 五、中奖流程详解

### 1. 中奖检测流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        中奖处理流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  _onReelStop() 转轴停止                                          │
│           ↓                                                     │
│  检查 data.totalWin > 0 ?                                       │
│           ↓ (是)                                                │
│  _doWinFlow()                                                   │
│     │                                                           │
│     ├── 1. Wild 动画                                            │
│     │     ActionWild.run()                                      │
│     │     └── _effectPanel.playSymbolAni(wildWins)              │
│     │                                                           │
│     ├── 2. 计数动画                                              │
│     │     ActionCounting.run()                                  │
│     │     ├── _line.showAni(lines, totalWin)                    │
│     │     └── _effectPanel.playSymbolAni(boxes)                 │
│     │                                                           │
│     ├── 3. 全线展示                                              │
│     │     ActionAllLine.run()                                   │
│     │     ├── _line.showAni(lines, totalWin)                    │
│     │     └── _effectPanel.playSymbolAni(boxes)                 │
│     │                                                           │
│     ├── 4. 逐线展示                                              │
│     │     ActionLineWin.run()                                   │
│     │     └── for each lineWin:                                 │
│     │         ├── _effectPanel.playSymbolAni(box)               │
│     │         ├── _line.showAni(line, win)                      │
│     │         └── SoundManager.playPayLine(lineWin)             │
│     │                                                           │
│     ├── 5. 符号奖展示                                            │
│     │     ActionSymbolWin.run()                                 │
│     │     └── for each symbolWin:                               │
│     │         └── _effectPanel.playSymbolAni(box)               │
│     │                                                           │
│     └── 6. Big Win 展示 (如果达到阈值)                           │
│           BigWinPanel.show()                                    │
│                                                                 │
│           ↓                                                     │
│  _takeWin() 收取奖金                                             │
│     ├── 更新 currentWin                                         │
│     ├── 更新 balance                                            │
│     └── 播放收币动画                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Action 系统

```javascript
// Action 基类
mm.Action.extend({
  _isLoop: false,      // 是否循环
  _duration: 2,        // 持续时间
  _isPlaying: false,   // 是否播放中
  _completeCallback: null,
  
  run: function() {
    this._isPlaying = true;
    // 子类实现具体逻辑
  },
  
  stop: function() {
    this._isPlaying = false;
  },
  
  _complete: function() {
    this._isPlaying = false;
    if (this._completeCallback) {
      this._completeCallback();
    }
  }
});

// ActionAllLine - 全线同时展示
ActionAllLine = mm.Action.extend({
  run: function(loopCounter) {
    this._super();
    
    // 显示所有中奖线
    this._line.showAni(this._data.lines, this._data.totalWin, this._duration);
    
    // 播放所有中奖符号动画
    this._effectPanel.playSymbolAni(this._boxes, this._duration);
    
    this._loopCounter = loopCounter || 0;
  },
  
  stop: function() {
    this._super();
    this._line.reset();
    this._effectPanel.stopSymbolAni(this._boxes);
    
    // 第一次循环完成回调
    if (this._loopCounter === 0 && this._firstComplete) {
      this._firstComplete();
    }
  }
});

// ActionLineWin - 逐线展示
ActionLineWin = mm.Action.extend({
  _index: 0,
  _subDur: 2,
  _scheduler: null,
  
  run: function(loopCounter) {
    if (this._lineWins.length === 0) {
      return this._complete();
    }
    
    this._super();
    this._index = 0;
    
    // 立即播放第一条
    this._play(loopCounter);
    
    // 定时播放后续
    this._scheduler = mm.setInterval(
      this._play.bind(this, loopCounter), 
      this._subDur * 1000
    );
  },
  
  _play: function(loopCounter) {
    // 停止上一条
    if (this._preItem) {
      this._effectPanel.stopSymbolAni(this._preItem.box);
    }
    
    var item = this._lineWins[this._index];
    if (!item) return;
    
    // 播放当前线
    this._effectPanel.playSymbolAni(item.box);
    this._line.showAni(item.line, item.win);
    
    // 播放音效
    if (loopCounter < 1) {
      SoundManager.create().playPayLine(item);
    }
    
    this._preItem = item;
    this._index++;
  }
});
```

## 六、免费游戏流程

### 1. 触发检测

```javascript
_doGameFlow: function(isFromWin) {
  var data = this._data;
  
  // 更新余额差
  this.updateBalance(data.balance - spade.content.balance);
  
  // 设置等待状态
  this._controlBar.setSlotStatus(SlotStatus.WAIT);
  
  // 显示提示动画
  var delay = this._getTipsWinTimeDur(data.totalWin);
  
  mm.delay(function() {
    if (data.isFree) {
      // 进入免费游戏
      this._doFreeGame();
    } else if (data.isBonus) {
      // 进入奖励游戏
      this._doBonusGame();
    } else if (isFromWin) {
      // 从中奖流程来，等待下一轮
      this._reels.runAlphaForReel(1);
      this._controlBar.setSlotStatus(SlotStatus.NEXT);
    } else {
      // 正常状态
      this._controlBar.setSlotStatus(SlotStatus.NORMAL);
    }
  }.bind(this), delay);
}
```

### 2. 免费游戏流程

```
┌─────────────────────────────────────────────────────────────────┐
│                        免费游戏流程                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  _doFreeGame()                                                  │
│           ↓                                                     │
│  [首次触发?]                                                     │
│       ↓ 是                                                      │
│  _freeGameTrigger()                                             │
│     ├── 播放触发动画                                             │
│     └── SoundManager.playScatter()                              │
│           ↓                                                     │
│  _freeGameIntroBefore()                                         │
│     ├── 预加载免费游戏资源                                        │
│     └── 切换背景                                                 │
│           ↓                                                     │
│  showFreeGameIntro()                                            │
│     └── 显示免费游戏介绍面板                                      │
│           ↓                                                     │
│  [玩家点击继续]                                                  │
│           ↓                                                     │
│  _freeGameIntroComplete()                                       │
│     ├── 更新界面                                                │
│     ├── showFreeTips(remainSpins)                               │
│     └── setSlotStatus(NORMAL)                                   │
│           ↓                                                     │
│  [免费旋转循环] ←─────────────────────┐                          │
│           ↓                          │                          │
│  _spin() // 自动旋转                  │                          │
│           ↓                          │                          │
│  [收到结果]                           │                          │
│           ↓                          │                          │
│  [还有剩余次数?] ─── 是 ──────────────┘                          │
│           ↓ 否                                                  │
│  [重新触发?]                                                     │
│       ↓ 是                                                      │
│  _freeGameReTrigger()                                           │
│     └── 增加免费次数                                             │
│           ↓                                                     │
│  _freeGameComplete()                                            │
│     ├── 显示总奖金                                               │
│     ├── 恢复主游戏背景                                           │
│     └── setSlotStatus(NORMAL)                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 七、网络通信

### 1. Service 单例

```javascript
Service = {
  _instance: null,
  _socket: null,
  _session: null,
  
  create: function() {
    if (!this._instance) {
      this._instance = new ServiceImpl();
    }
    return this._instance;
  },
  
  _Commands: {
    KICK_OUT: 'kickOut',
    EXT_MSG: 'extMsg',
    BONUS_CREDIT: 'bonusCredit',
    INFO_UPDATE: 'infoUpdate',
    BALANCE_UPDATE: 'balanceUpdate',
    EXTEND_SESSION: 'extendSession'
  },
  
  _SlotCommands: {
    GAME_START: 500,
    SPIN: 501,
    BONUS_SPIN: 502,
    // ...
  }
};
```

### 2. 请求/响应流程

```javascript
// 发送旋转请求
spin: function(params, callback, context) {
  this._send(Service._SlotCommands.SPIN, params, function(response) {
    if (response.code === 0) {
      // 成功
      callback.call(context, response);
    } else {
      // 错误处理
      emitter.emit(TransformEventName.ShowErrorMessageTip, 
                   "RES_" + response.code);
    }
  });
}

// 服务器推送处理
bindPushEvent: function(command, handler, context) {
  this._pushHandlers[command] = {
    handler: handler,
    context: context
  };
}
```

### 3. 响应数据结构

```javascript
// 旋转响应
{
  code: 0,                    // 错误码 (0=成功)
  symbol: [1,2,3,4,5,...],   // 符号数组 (按行排列)
  totalWin: 1000,            // 总奖金
  balance: 50000,            // 新余额
  successBet: 100,           // 成功下注金额
  
  lineWins: [                // 线奖
    {
      line: 1,               // 线号
      symbol: 2,             // 中奖符号
      hits: 3,               // 命中数量
      win: 500,              // 奖金
      side: "L",             // 方向 L=左 R=右
      wild: 0,               // Wild数量
      wilds: [1]             // Wild位置
    }
  ],
  
  symbolWins: [              // 符号奖 (Scatter等)
    {
      symbol: 0,             // 符号索引
      hits: 3,               // 命中数量
      win: 500               // 奖金
    }
  ],
  
  freeGame: {                // 免费游戏信息
    spins: 10,               // 总次数
    currSpin: 0,             // 当前次数
    multiples: [1,2,3],      // 倍数
    currMutiply: 1           // 当前倍数
  },
  
  bonusGame: {               // 奖励游戏
    // ...
  },
  
  jackpot: {                 // 彩金
    // ...
  }
}
```

## 八、事件系统详解

### 1. emitter 实现

```javascript
var EventEmitter = function() {
  this.container = new Map();
};

EventEmitter.prototype = {
  on: function(event, handler, context) {
    var handlers = this.container.get(event);
    if (!handlers) {
      this.container.set(event, handlers = []);
    }
    handlers.push({
      handler: handler,
      thisArg: context
    });
  },
  
  off: function(event, handler) {
    if (handler === undefined) {
      this.container.delete(event);
      return;
    }
    
    var handlers = this.container.get(event);
    if (handlers) {
      var index = handlers.findIndex(h => h.handler === handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  },
  
  emit: function(event /*, args... */) {
    var handlers = this.container.get(event);
    if (handlers) {
      var args = [].slice.call(arguments, 1);
      handlers.slice(0).forEach(function(h) {
        h.handler.apply(h.thisArg, args);
      });
    }
  }
};

// 全局单例
emitter = new EventEmitter();
```

### 2. 关键事件列表

| 事件名 | 触发时机 | 参数 |
|--------|---------|------|
| `events.controlbar.spin` | 点击旋转按钮 | - |
| `events.controlbar.stop` | 点击停止按钮 | - |
| `events.reels.stop` | 所有转轴停止 | - |
| `events.reels.single_stop` | 单个转轴停止 | isHit |
| `events.reels.single_spin` | 单个转轴开始旋转 | reel |
| `show-spin-button` | 显示旋转按钮 | visible |
| `show-error-message-tip` | 显示错误提示 | message |
| `bet-change` | 下注金额改变 | betInfo |

## 九、音频系统

### 1. SoundManager

```javascript
SoundManager = {
  _instance: null,
  
  create: function() {
    if (!this._instance) {
      this._instance = new SoundManagerImpl();
    }
    return this._instance;
  }
};

SoundManagerImpl.prototype = {
  // 转轴音效
  playReelSpin: function() { },
  playReelStop: function(reelIndex) { },
  
  // 中奖音效
  playPayLine: function(lineWin) { },
  playWild: function() { },
  playScatter: function() { },
  
  // Big Win 音效
  playBigWin: function() { },
  playBigWinChange: function() { },
  
  // 背景音乐
  playBgm: function(name) { },
  stopBgm: function() { },
  
  // 控制
  setMute: function(mute) { },
  setVolume: function(volume) { }
};
```

## 十、性能优化机制

### 1. 对象池

```javascript
// 符号对象池
SymbolPool = {
  _pool: [],
  
  get: function() {
    return this._pool.length > 0 ? 
           this._pool.pop() : 
           new Symbol();
  },
  
  put: function(symbol) {
    symbol.reset();
    this._pool.push(symbol);
  }
};
```

### 2. 纹理缓存

```javascript
// PIXI 纹理缓存
PIXI.Texture.fromFrame(frameName);
PIXI.Sprite.from(textureName);

// 资源释放
SlotUtils.releaseResources = function(keys) {
  keys.forEach(function(key) {
    var texture = PIXI.utils.TextureCache[key];
    if (texture) {
      texture.destroy(true);
      delete PIXI.utils.TextureCache[key];
    }
  });
};
```

### 3. GSAP 动画优化

```javascript
// 使用时间线统一管理
var tl = gsap.timeline();
tl.to(obj, { x: 100, duration: 0.3 })
  .to(obj, { y: 100, duration: 0.3 });

// 停止时清理
tl.kill();

// 使用 onComplete 而非 setTimeout
gsap.to(obj, {
  x: 100,
  duration: 0.3,
  onComplete: callback
});
```

## 总结

FastSpin 引擎的运行时逻辑核心：

1. **状态机驱动** - 通过 `SlotStatus` 管理游戏状态转换
2. **事件驱动** - 通过 `emitter` 解耦组件通信
3. **动作系统** - 通过 `Action` 类管理复杂的动画序列
4. **GSAP 动画** - 所有动画使用 GSAP 实现，支持时间线和缓动
5. **服务器同步** - 旋转结果完全由服务器决定，客户端只负责展示
