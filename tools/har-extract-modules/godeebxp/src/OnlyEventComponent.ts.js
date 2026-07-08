// 源模块: chunks:///_virtual/OnlyEventComponent.ts
// 来自 HAR: https://play.godeebxp.com/egames/cc497f08a3f9943e8d426d034df6261a1330fd17/game/assets/main/index.js
// 注意：这是编译后 JS（非原始 TS），变量名可能被压缩

System.register("chunks:///_virtual/OnlyEventComponent.ts",["cc"],(function(t){"use strict";var n;return{setters:[function(t){n=t.cclegacy}],execute:function(){n._RF.push({},"a6c08V+ZSRPWbgvzyDEx52J","OnlyEventComponent",void 0);t("default",function(){function t(){this._events=new Map}var n=t.prototype;return n.on=function(t,n){this._events.has(t)?Log.e(t+" 重複註冊"):(App.dispatcher.on(t,n,this),this._events.set(t,n))},n.off=function(t){this._events.has(t)&&(App.dispatcher.off(t,this),this._events.delete(t))},n.addEvents=function(){},n.onLoad=function(){this.addEvents()},n.onDestroy=function(){var t=this;this._events.forEach((function(n,e){App.dispatcher.off(e,t)})),this._events.clear()},t}());n._RF.pop()}}}));
