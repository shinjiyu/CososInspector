// 源模块: chunks:///_virtual/ColorProxy.ts
// 来自 HAR: https://play.godeebxp.com/egames/cc497f08a3f9943e8d426d034df6261a1330fd17/game/assets/main/index.js
// 注意：这是编译后 JS（非原始 TS），变量名可能被压缩

System.register("chunks:///_virtual/ColorProxy.ts",["cc"],(function(t){"use strict";var o;return{setters:[function(t){o=t.cclegacy}],execute:function(){t("injectColorData",(function(t){})),o._RF.push({},"dce5fFimkxGyYeB+PcKCJ9U","ColorProxy",void 0);t("ColorProxy",function(){function t(){this.bundle=void 0,this.datas=new Map,this.init()}var o=t.prototype;return o.add=function(t){t.mode?this.datas.set(t.mode,t):this.datas.set("enum",t)},o.merge=function(t,o){var e=this.datas.get(t);return e&&(o[this.bundle]=e.data),o},o.importColors=function(t){for(var o in t)if(Object.prototype.hasOwnProperty.call(t,o)){var e=t[o];this.add(e)}},t}());o._RF.pop()}}}));
