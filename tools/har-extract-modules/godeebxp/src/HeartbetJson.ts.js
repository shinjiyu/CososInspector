// 源模块: chunks:///_virtual/HeartbetJson.ts
// 来自 HAR: https://play.godeebxp.com/egames/cc497f08a3f9943e8d426d034df6261a1330fd17/game/assets/main/index.js
// 注意：这是编译后 JS（非原始 TS），变量名可能被压缩

System.register("chunks:///_virtual/HeartbetJson.ts",["./rollupPluginModLoBabelHelpers.js","cc","./JsonMessage.ts","./CmdDefines.ts"],(function(t){"use strict";var e,n,s,r,i,u;return{setters:[function(t){e=t.inheritsLoose,n=t.createClass},function(t){s=t.cclegacy},function(t){r=t.JsonMessageHeartbeat},function(t){i=t.MainCmd,u=t.SUB_CMD_SYS}],execute:function(){s._RF.push({},"bf8fbqBBmlMgpCa176v8+Pq","HeartbetJson",void 0);t("HeartbeatJson",function(t){function s(){for(var e,n=arguments.length,s=new Array(n),r=0;r<n;r++)s[r]=arguments[r];return(e=t.call.apply(t,[this].concat(s))||this).buffer=null,e.mainCmd=i.CMD_SYS,e.subCmd=u.CMD_SYS_HEART,e}return e(s,t),n(s,[{key:"cmd",get:function(){return String(this.mainCmd)+String(this.subCmd)}}]),s}(r));s._RF.pop()}}}));
