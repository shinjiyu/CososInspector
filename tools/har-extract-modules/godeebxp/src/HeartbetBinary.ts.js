// 源模块: chunks:///_virtual/HeartbetBinary.ts
// 来自 HAR: https://play.godeebxp.com/egames/cc497f08a3f9943e8d426d034df6261a1330fd17/game/assets/main/index.js
// 注意：这是编译后 JS（非原始 TS），变量名可能被压缩

System.register("chunks:///_virtual/HeartbetBinary.ts",["./rollupPluginModLoBabelHelpers.js","cc","./BinaryStreamMessage.ts","./CmdDefines.ts"],(function(t){"use strict";var e,n,r,i,a,s;return{setters:[function(t){e=t.inheritsLoose,n=t.createClass},function(t){r=t.cclegacy},function(t){i=t.BinaryStreamHeartbeat},function(t){a=t.MainCmd,s=t.SUB_CMD_SYS}],execute:function(){r._RF.push({},"fad937gxhNAP5F5raDpetvK","HeartbetBinary",void 0);t("HeartbeatBinary",function(t){function r(){for(var e,n=arguments.length,r=new Array(n),i=0;i<n;i++)r[i]=arguments[i];return(e=t.call.apply(t,[this].concat(r))||this).mainCmd=a.CMD_SYS,e.subCmd=s.CMD_SYS_HEART,e}return e(r,t),n(r,[{key:"cmd",get:function(){return String(this.mainCmd)+String(this.subCmd)}}]),r}(i));r._RF.pop()}}}));
