eval(function(n){
  "use strict";
  function r(n){
    var r=[];
    return r[n-1]=void 0,r}
    function u(n,r){
      return f(n[0]+r[0],n[1]+r[1])}
      function t(n,r){
        var u,t;
        return n[0]==r[0]&&n[1]==r[1]?0:(u=0>n[1],t=0>r[1],u&&!t?-1:!u&&t?1:a(n,r)[1]<0?-1:1)}
        function f(n,r){
          var u,t;
          for(r%=0x10000000000000000,n%=0x10000000000000000,u=r%un,t=Math.floor(n/un)*un,r=r-u+t,n=n-t+u;
          0>n;
        )n+=un,r-=un;
        for(;
        n>4294967295;
      )n-=un,r+=un;
      for(r%=0x10000000000000000;
      r>0x7fffffff00000000;
    )r-=0x10000000000000000;
    for(;
    -0x8000000000000000>r;
  )r+=0x10000000000000000;
  return[n,r]}
  function i(n){
    return n>=0?[n,0]:[n+un,-un]}
    function c(n){
      return n[0]>=2147483648?~~Math.max(Math.min(n[0]-un,2147483647),-2147483648):~~Math.max(Math.min(n[0],2147483647),-2147483648)}
      function a(n,r){
        return f(n[0]-r[0],n[1]-r[1])}
        function o(n,r){
          return n.ab=r,n.cb=0,n.O=r.length,n}
          function e(n){
            return n.cb>=n.O?-1:255&n.ab[n.cb++]}
            function v(n){
              return n.ab=r(32),n.O=0,n}
              function s(n){
                var r=n.ab;
                return r.length=n.O,r}
                function g(n,r,u,t){
                  l(r,u,n.ab,n.O,t),n.O+=t}
                  function l(n,r,u,t,f){
                    for(var i=0;
                    f>i;
                    ++i)u[t+i]=n[r+i]}
                    function C(n,r,u){
                      var t,f,c,a,o="",v=[];
                      for(f=0;
                      5>f;
                      ++f){
                        if(c=e(r),-1==c)throw Error("truncated input");
                        v[f]=c<<24>>24}
                        if(t=F({
                        }
                      ),!V(t,v))throw Error("corrupted input");
                      for(f=0;
                      64>f;
                      f+=8){
                        if(c=e(r),-1==c)throw Error("truncated input");
                        c=c.toString(16),1==c.length&&(c="0"+c),o=c+""+o}
                        /^0+$|^f+$/i.test(o)?n.M=tn:(a=parseInt(o,16),n.M=a>4294967295?tn:i(a)),n.S=M(t,r,u,n.M)}
                        function z(n,r){
                          return n.Y=v({
                          }
                        ),C(n,o({
                        }
                        ,r),n.Y),n}
                        function p(n,r,u){
                          var t=n.y-r-1;
                          for(0>t&&(t+=n.c);
                          0!=u;
                          --u)t>=n.c&&(t=0),n.x[n.y++]=n.x[t++],n.y>=n.c&&N(n)}
                          function x(n,u){
                            (null==n.x||n.c!=u)&&(n.x=r(u)),n.c=u,n.y=0,n.w=0}
                            function N(n){
                              var r=n.y-n.w;
                              r&&(g(n.T,n.x,n.w,r),n.y>=n.c&&(n.y=0),n.w=n.y)}
                              function d(n,r){
                                var u=n.y-r-1;
                                return 0>u&&(u+=n.c),n.x[u]}
                                function J(n,r){
                                  n.x[n.y++]=r,n.y>=n.c&&N(n)}
                                  function L(n){
                                    N(n),n.T=null}
                                    function j(n){
                                      return n-=2,4>n?n:3}
                                      function B(n){
                                        return 4>n?0:10>n?n-3:n-6}
                                        function b(n,r){
                                          return n.h=r,n.bb=null,n.V=1,n}
                                          function k(n){
                                            if(!n.V)throw Error("bad state");
                                            if(n.bb)throw Error("No encoding");
                                            return h(n),n.V}
                                            function h(n){
                                              var r=U(n.h);
                                              if(-1==r)throw Error("corrupted input");
                                              n.$=tn,n.Z=n.h.d,(r||t(n.h.U,fn)>=0&&t(n.h.d,n.h.U)>=0)&&(N(n.h.b),L(n.h.b),n.h.a.K=null,n.V=0)}
                                              function M(n,r,u,t){
                                                return n.a.K=r,L(n.b),n.b.T=u,A(n),n.f=0,n.l=0,n.Q=0,n.R=0,n._=0,n.U=t,n.d=fn,n.G=0,b({
                                                }
                                                ,n)}
                                                function U(n){
                                                  var r,f,a,o,e,v;
                                                  if(v=c(n.d)&n.P,Q(n.a,n.t,(n.f<<4)+v)){
                                                    if(Q(n.a,n.E,n.f))a=0,Q(n.a,n.r,n.f)?(Q(n.a,n.u,n.f)?(Q(n.a,n.s,n.f)?(f=n._,n._=n.R):f=n.R,n.R=n.Q):f=n.Q,n.Q=n.l,n.l=f):Q(n.a,n.o,(n.f<<4)+v)||(n.f=7>n.f?9:11,a=1),a||(a=q(n.n,n.a,v)+2,n.f=7>n.f?8:11);
                                                    else if(n._=n.R,n.R=n.Q,n.Q=n.l,a=2+q(n.D,n.a,v),n.f=7>n.f?7:10,e=S(n.k[j(a)],n.a),e>=4){
                                                      if(o=(e>>1)-1,n.l=(2|1&e)<<o,14>e)n.l+=X(n.J,n.l-e-1,n.a,o);
                                                      else if(n.l+=T(n.a,o-4)<<4,n.l+=Y(n.q,n.a),0>n.l)return-1==n.l?1:-1}
                                                      else n.l=e;
                                                      if(t(i(n.l),n.d)>=0||n.l>=n.m)return-1;
                                                      p(n.b,n.l,a),n.d=u(n.d,i(a)),n.G=d(n.b,0)}
                                                      else r=D(n.j,c(n.d),n.G),n.G=7>n.f?E(r,n.a):R(r,n.a,d(n.b,n.l)),J(n.b,n.G),n.f=B(n.f),n.d=u(n.d,cn);
                                                      return 0}
                                                      function F(n){
                                                        n.b={
                                                        }
                                                        ,n.a={
                                                        }
                                                        ,n.t=r(192),n.E=r(12),n.r=r(12),n.u=r(12),n.s=r(12),n.o=r(192),n.k=r(4),n.J=r(114),n.q=H({
                                                        }
                                                        ,4),n.D=m({
                                                        }
                                                      ),n.n=m({
                                                      }
                                                    ),n.j={
                                                    }
                                                    ;
                                                    for(var u=0;
                                                    4>u;
                                                    ++u)n.k[u]=H({
                                                    }
                                                    ,6);
                                                    return n}
                                                    function A(n){
                                                      n.b.w=0,n.b.y=0,I(n.t),I(n.o),I(n.E),I(n.r),I(n.u),I(n.s),I(n.J),Z(n.j);
                                                      for(var r=0;
                                                      4>r;
                                                      ++r)I(n.k[r].z);
                                                      w(n.D),w(n.n),I(n.q.z),K(n.a)}
                                                      function V(n,r){
                                                        var u,t,f,i,c,a,o;
                                                        if(5>r.length)return 0;
                                                        for(o=255&r[0],f=o%9,a=~~(o/9),i=a%5,c=~~(a/5),u=0,t=0;
                                                        4>t;
                                                        ++t)u+=(255&r[1+t])<<8*t;
                                                        return u>99999999||!W(n,f,i,c)?0:G(n,u)}
                                                        function G(n,r){
                                                          return 0>r?0:(n.A!=r&&(n.A=r,n.m=Math.max(n.A,1),x(n.b,Math.max(n.m,4096))),1)}
                                                          function W(n,r,u,t){
                                                            if(r>8||u>4||t>4)return 0;
                                                            P(n.j,u,r);
                                                            var f=1<<t;
                                                            return O(n.D,f),O(n.n,f),n.P=f-1,1}
                                                            function O(n,r){
                                                              for(;
                                                              r>n.e;
                                                              ++n.e)n.I[n.e]=H({
                                                              }
                                                              ,3),n.H[n.e]=H({
                                                              }
                                                              ,3)}
                                                              function q(n,r,u){
                                                                if(!Q(r,n.N,0))return S(n.I[u],r);
                                                                var t=8;
                                                                return t+=Q(r,n.N,1)?8+S(n.L,r):S(n.H[u],r)}
                                                                function m(n){
                                                                  return n.N=r(2),n.I=r(16),n.H=r(16),n.L=H({
                                                                  }
                                                                  ,8),n.e=0,n}
                                                                  function w(n){
                                                                    I(n.N);
                                                                    for(var r=0;
                                                                    n.e>r;
                                                                    ++r)I(n.I[r].z),I(n.H[r].z);
                                                                    I(n.L.z)}
                                                                    function P(n,u,t){
                                                                      var f,i;
                                                                      if(null==n.F||n.g!=t||n.B!=u)for(n.B=u,n.X=(1<<u)-1,n.g=t,i=1<<n.g+n.B,n.F=r(i),f=0;
                                                                      i>f;
                                                                      ++f)n.F[f]=y({
                                                                      }
                                                                    )}
                                                                    function D(n,r,u){
                                                                      return n.F[((r&n.X)<<n.g)+((255&u)>>>8-n.g)]}
                                                                      function Z(n){
                                                                        var r,u;
                                                                        for(u=1<<n.g+n.B,r=0;
                                                                        u>r;
                                                                        ++r)I(n.F[r].v)}
                                                                        function E(n,r){
                                                                          var u=1;
                                                                          do u=u<<1|Q(r,n.v,u);
                                                                          while(256>u);
                                                                          return u<<24>>24}
                                                                          function R(n,r,u){
                                                                            var t,f,i=1;
                                                                            do if(f=u>>7&1,u<<=1,t=Q(r,n.v,(1+f<<8)+i),i=i<<1|t,f!=t){
                                                                              for(;
                                                                              256>i;
                                                                            )i=i<<1|Q(r,n.v,i);
                                                                            break}
                                                                            while(256>i);
                                                                            return i<<24>>24}
                                                                            function y(n){
                                                                              return n.v=r(768),n}
                                                                              function H(n,u){
                                                                                return n.C=u,n.z=r(1<<u),n}
                                                                                function S(n,r){
                                                                                  var u,t=1;
                                                                                  for(u=n.C;
                                                                                  0!=u;
                                                                                  --u)t=(t<<1)+Q(r,n.z,t);
                                                                                  return t-(1<<n.C)}
                                                                                  function Y(n,r){
                                                                                    var u,t,f=1,i=0;
                                                                                    for(t=0;
                                                                                    n.C>t;
                                                                                    ++t)u=Q(r,n.z,f),f<<=1,f+=u,i|=u<<t;
                                                                                    return i}
                                                                                    function X(n,r,u,t){
                                                                                      var f,i,c=1,a=0;
                                                                                      for(i=0;
                                                                                      t>i;
                                                                                      ++i)f=Q(u,n,r+c),c<<=1,c+=f,a|=f<<i;
                                                                                      return a}
                                                                                      function Q(n,r,u){
                                                                                        var t,f=r[u];
                                                                                        return t=(n.i>>>11)*f,(-2147483648^t)>(-2147483648^n.p)?(n.i=t,r[u]=f+(2048-f>>>5)<<16>>16,-16777216&n.i||(n.p=n.p<<8|e(n.K),n.i<<=8),0):(n.i-=t,n.p-=t,r[u]=f-(f>>>5)<<16>>16,-16777216&n.i||(n.p=n.p<<8|e(n.K),n.i<<=8),1)}
                                                                                        function T(n,r){
                                                                                          var u,t,f=0;
                                                                                          for(u=r;
                                                                                          0!=u;
                                                                                          --u)n.i>>>=1,t=n.p-n.i>>>31,n.p-=n.i&t-1,f=f<<1|1-t,-16777216&n.i||(n.p=n.p<<8|e(n.K),n.i<<=8);
                                                                                          return f}
                                                                                          function K(n){
                                                                                            n.p=0,n.i=-1;
                                                                                            for(var r=0;
                                                                                            5>r;
                                                                                            ++r)n.p=n.p<<8|e(n.K)}
                                                                                            function I(n){
                                                                                              for(var r=n.length-1;
                                                                                              r>=0;
                                                                                              --r)n[r]=1024}
                                                                                              function _(n){
                                                                                                for(var r,u,t,f=0,i=0,c=n.length,a=[],o=[];
                                                                                                c>f;
                                                                                                ++f,++i){
                                                                                                  if(r=255&n[f],128&r)if(192==(224&r)){
                                                                                                    if(f+1>=n.length)return n;
                                                                                                    if(u=255&n[++f],128!=(192&u))return n;
                                                                                                    o[i]=(31&r)<<6|63&u}
                                                                                                    else{
                                                                                                      if(224!=(240&r))return n;
                                                                                                      if(f+2>=n.length)return n;
                                                                                                      if(u=255&n[++f],128!=(192&u))return n;
                                                                                                      if(t=255&n[++f],128!=(192&t))return n;
                                                                                                      o[i]=(15&r)<<12|(63&u)<<6|63&t}
                                                                                                      else{
                                                                                                        if(!r)return n;
                                                                                                        o[i]=r}
                                                                                                        65535==i&&(a.push(String.fromCharCode.apply(String,o)),i=-1)}
                                                                                                        return i>0&&(o.length=i,a.push(String.fromCharCode.apply(String,o))),a.join("")}
                                                                                                        function $(n){
                                                                                                          return n>64&&91>n?n-65:n>96&&123>n?n-71:n>47&&58>n?n+4:43===n?62:47===n?63:0}
                                                                                                          function nn(r){
                                                                                                            for(var u,t,f=r.length,i=3*f+1>>>2,c=new Array(i),a=0,o=0,e=0;
                                                                                                            f>e;
                                                                                                            e++)if(t=3&e,a|=$(r.charCodeAt(e))<<18-6*t,3===t||f-e===1){
                                                                                                              for(u=0;
                                                                                                              3>u&&i>o;
                                                                                                              u++,o++)c[o]=a>>>(16>>>u&24)&255;
                                                                                                              a=0}
                                                                                                              return c}
                                                                                                              function rn(n){
                                                                                                                n=nn(n);
                                                                                                                var r={
                                                                                                                }
                                                                                                                ;
                                                                                                                for(r.d=z({
                                                                                                                }
                                                                                                                ,n);
                                                                                                                k(r.d.S);
                                                                                                              );
                                                                                                              return _(s(r.d.Y))}
                                                                                                              var un=4294967296,tn=[4294967295,-un],fn=[0,0],cn=[1,0];
                                                                                                              return rn}
                                                                                                              (this)("XQAAAQDfDgEAAAAAAAA7GEqmJ8/jtRiB6KbMnJfRAL/6KuhbE1lWP2K4Kqrc2kQz/c4sQq/rfB8So8ZA9eOxwjx+haDfE8+znBlSGRot+IDfChuOHx8K4+qnfMWQ6IVUyIoqEtLC5RTSYO/+PPQ59tUWMKzPrvyVg2EP2echxfWTB8+P8VbOtD3qpuuTaxjLCIjp6HrUPI6iiC7c2lE4FUq9i8hxOJnVs5KlZag7puu6L8pFKyEj0R+8OZrtDJt3dtptp4kZ38BNoukEiOYVEMhWt15nV9GTgXXV8lOmm1rZTHmzH34jJorP7XgsQwSq2Loi238+A4bjnx3zbWMzEVGryaxORDtKRp1gXKi7pRNlkYV2mbfKneGA8+BTxpwhf14YC20Ax0ZOxVGDH5ZveHtF60IP+jiD9y4SLiQGy+zdrG9z3XMoafkI8PVPxOk3eRQWbH6+d6zp4tjv6T2SPa0Kfs0WufXG2ySTxeaD7Te4yVbZGjahqNH7jKoIXIs+nLoVa9TwvRqtLtPD56M6DCIefojDHzbpExJ+OynuGHM7fwR7iU3mXgKwappors312k97RQe2osd40obG1AGPSWLyJD5uuheMK7LcXOM074pOocOpPPMGbSZptrbCTk1Y2otcoy3A7XvDo4dlrZaywd+LSagc7PoLPHbOssluyGzYoGH6B4hdWRJrYwS++Lm6HtHa2vCnCm5BbkUqLqJbqoNzyrQKU9I4Bw8eghouXYTuu0x7Cq2AdlHfRR8WNDo4eIoeic6+s1EcAsW490kYB1Iuh35e9D0eQdT578PzZ1GbThYdSyYswnc8SrvsVRFk9S7dKQ3krmg+laNj82XhQmlkEH5VTirvB8ybe5ppbRoQvVtTfFYea5nd050lTyIjGtQKwdJqOGgma0lHMl+mtH3h/9nuE2tEJ/MHmub2f8jXco2eOX9Wl+Ix3Zq798YAZNtW/cCLSllt1F6+OusYPArAy+Zm3N6E1XUjpmEp/JI1C1Li3N7FXKDujbZFz6Y3upJH4OYaXT+tuDoZ6Pf4TrZv7aLU/NzS35fAEfsq4MIbSmKcsE3xTprJJ9epTIGrBktYRbcRZVT+m5TiOpE9v2HpH35YPysMNpFlmeZu+ql36sb2qEWwZvJhqwnqYqxDzBHjpwoY4Zcy4/lgJKDOCjrjhA/57jGb5WFuyaAwSsN4eLG7+vQimPwjlbwaw4cddZbL0a4dNF3nZBdhVDyHCsOuZ3lPHTEPs1AAYRAkdLRIJhmjatdg56P+P1eugeacpkLM+wy1NsLE0V+OU7Zq2zXmbu2qu0aOyCf8gVj3c6SZLv3JTQZ8WtVWBXfMLBPvR0JOn+dxe1TT8qZZBURSZzGl4aVGBLDW2QwqTSmHC5trGMWm9Y5qmomddVhLAWu9SqZlviC8GNnO/BROVFwPAQbXnzicRp985KaBpFrkz1kEfebijg+GS6b9PuYEbUZOBd6pgbdGkkTk/cF0CmVZdmEzXSJc3Ivl6HCzJJsUML2VdOVhFp18CFW0T0KCZ43ITRssBS5kyY4APcchDzy3olBWIy73Vx4PmXktNlbevv7BPpQmVIShkLPcxNIHZi3mtDclJc2jr4rLNykstJyQXq06cGZOxrr/W4pAa8D5twSdVto7kyWR4okTyxF6+q3GVh7/Gk6qkDpepvIZ1bqkOmQwONFmLoBLf40yUyl5M9z7RQ/EqnXM/Ensy1X2DBFgwzqRDTP+HYaanE5McMUwtgGTtNGIjkAJVYPHR1bur4BzVUMbsLTh0Zn8QTwFODe+cfn+wiUHjoly0Z8nmZzJYgpOJ7R5jXDXwMyWOnyIHviNMujaRDz4Ng2tIZaNS5EqlsVJTRAVPlawaLeMJqFyx/nBHRWLGWALGAgZzFMpzQnGl2rKJ/z1FmXIVfcJaxPL8FyWnEDYk/8koPARXiyUU6kZ13pS81v9lpwl9xH98noyj3mRIvSn9Suw9sCx/6WQOjkcyAb1sqmHAm3xl1cC0IKC5bSbnp1BBVmW8UI2g6H4dN3mOtaadNTb2jydk5quAkgB8EVuCK0dxrECm0cNLpjT051y6jSO8V1j6euXUP8fP8WCx8AsBl1aDLS/uYfs5Dgl/o1I1gcv+Vb949nlsQCH7m6D7uzcdYZQnmxJzDdsJjFXRk27lf0At3OLj2pEMO5Def1OfL24dxOOCgKvFboINv8b6RHHUkR3k3/teukdInj/NpBZ0jdL+LAc+Xfc4Y7gn7hlBNtct/FR8cu5AkuyiPpw5opdBsDG3peqg9W/2NuuVM6KkDIdEwwlEtCCD63YRk7TviIv1/ImP5F/I2Ntg9sCjCzMp185Ue4AaTUnq0BqowgQq08t+eCZ868q3EZarQzg3S3VjHim97zSaIK+0GM9bC4HWlY/OsAxyRPYE3UvvkkUpBETanPrxA+/KIvpLU47TjFHKkhqnSDIeDeZtmaAUu1IFz/wbeR3EHfxuGp0pdWPu4b9UNhiPpaZQN58Jrf4WRmHV/0doHHk1dmZTWBcn4WdUAjZU7ah2yTszgk1Wcgs4CcrgMSBHbRXrh8zZvpIAQoZsjW7zKbxBY9Q5XqYYXghaVdpY+PeCGX8UOjGf4/SThhJTcVBhlV3uhBM3K6cbkSnUTCXMe0aSHva0XmfzgJ9cfDyUGWcerAiH7+OP7k9ZX8bVbC8ptj0XCeNhroZ5xmVje41oEuEXcBiGzOshuktxfIL7Ji63ZIFKx+6gei/cuJDu2/71QbehnZIAMXRKpvyaiPn0Hnyb3PxsiOxXfKgZRbXy9VpUKHc9S3QdJrSsKMqRr0Gngp95QalQ4Es+hs34VIGEZh97AjC+5Ewe+VSANVaswaUW1dhsXcltNxTsDCZB2F8v5J5d9vumYUDGb0pav06Uk4zpvXfx7Ybp1dDeQWNH+0bXdUESxYTf7L9/kTFcNu5BjHIyMdTNTqTKv5y3zy0T2ll7hT9F7utReTMe7ItCe0vr2Myrysg+P00z7/5Nd5nTzE9CWuALQkY+TUYnhQhTntVbHF8vrQZdftMOS+tlBKKcVMRIIPvIAToXrsFBH828xAnRkDvtRQ2lew/M+m4KaVTVhTkyF66uWBJ1NfHbp2dipyZw+QgjZ6IDdPlBuNywm+j/3g0MSnaOkf970uieFZKIAMFVfWQ58PiZRNExajW3xh9YWeY/JJe2DqgwjJSeHfqS64NaB2nlwueojpnRJDJkRrlTq2IsbnxoBD4hW9vrrJ5v58+lFigLMX/NG5dLVizaL3QgCQnOSyNFXw/QXZ1nggn4RR55zQ/LK4RtnQ8VPCtW/qVidD0O62xBbllAMbuaaP9EeA1AVJySEiNXbUGYnugWYHoqannOkbtAwVoWCHObegvCiOJXZwge4twBTs9x/70Eu0jCK8zjRx6UDxDadNGw0SSiyl410H2Li/3ZTWKt27SDO1vKyhbKXnQ1pLq3waEWrRAtEuBgaucgEc5w5utsK6GBGE4Akzzt4NcTSeOIfNdEIlmOeiK7M3s6gBDJls3dzUDUTyj+uOgkIpAcqFtFhQOESAcCvAhZmc5DISLlM+ukoqA7lahvpj7K77i1FWfaPCkENkAlUh24k/ifzHYYnzXoGs6Xz14Bju0ZpNmRl8V1O2W4HuTETgayv0LJwHJcMCl/+zG9Df1Jy4fUGz/7tQDi7BXkZ4bWD0LWzHLuwQFaveF9Sw1s7pcmUvcR4zLnviDRpatBR5CC1ZR8CgiuXVJsykuhwvrrB0uCrha/qv9r4wQb1GzRLtrCsLKNNMKOBviSNRiL/VzIz2WIaVicxVqIxJ1uGCpn1PBAB3gdxjmjt1k/xl9YD+eR1MkkK0KLWLFtcn43QTzf+Tl5z2vte5umw7JJAlD9zGFsnh1wmkiZs49BsnV476fjClu12EvCdsx0/BTCwVfwtzut4RHM+z8rea5GB95ZStrCuO1ddlbtgQ6Jm351NqKq104kZ+KSH9Pk5pI+rT7XJ1Ncooy3VhkeDJ1w8k9YaFJWz7Xi3XCh5L/u3RcxtqerSL+SE3VbLHgcOnwcpG6q+GLmRs1n5nUyAUQXB+voFmdtXoyk3sS/ZSnJeK3pzLU2T2ry9Ep/82e0aqvFJQaU8iHh/y90+PuvO6M7axbMZBCRd/jQyEj6iKz/oc3K7//GAY9kbzmT9wUsqd9s4wRVOoexYBd4cFKojPMFGAdXG1Y8hQvny5tWSKqcaeQwTVHUytdkBh3Loa5IyhimOw6PuWAG2WpVDXBswDC4c4P1yufNI5lk3qAXg4TDQctr698UJchtyoP51E2cQqPxfWIixXbdTuj/ZQ11yhvg1sTybn/9IyY21Bk8f83tTVVpn693H0U9f5LY/hI8z9+txywW/X8e3YbZApg8Z4gnBI8lvg5RKFxbW+41tk3Ba6/F6JKK7Qv7JQEzV4fL9yocYnqKs9aLYpr+1m6NsaAHATHhaNK/Mdref1l0X/0hYjAHU3nVRn0u6DAiRKRcZpbxMC8ZwU9/88jcuwZEogxl0A6YFfsRsJ3WEurG0SZpWMUe0joGxDOT3mG2TOXnz4eD81SJOMNqZWj7UXDxYieWaGm7O1UEJaFIjKagVzPAm9Ua/bTxpO7XYYwHDhFqn7aAbwP/9UlNcUkAvw6PDhjzjVqCAWMbr79XEntS2e7W2YIUjuVlC0JBG+ergIkqda30rUuVRs1vXUpInxWzyHKBWF+0d+sx4O6AOxtUxdBpYlWu5dqeI5LQZusnvUcArEc5e9CKpUocMaRc2ePRE7x6dnr3ENyEoTHprtqtuFokpCwWzKUxu2pZP8+B7FCgUo1HSW8qP7G+x68Y8yoLcqCtQcKRSPdoLvWRyGY+E3+3u780nKeRLqM0LqrhK0yHc9c+DsFA3gq3ZQ1K9XaM7+vc4G8tCMDgW29Nc2K4UP6xdRL1Opc3Avvgv5DXJkGsHCZPw+XMsUiGfZrSBHIZhuykyEEHbVsNnpIJLV5+JU99i1gah5l6lkhJkeHeHA8RyKFT4zTJvxWshEVKVQtKuaEMyZne+OPJJKHSkZ3yF99oz5KZMxrN3lGbJ8xAE83pb4uHawQtQWlyOqQKKz8/hotWLzcWUEZNokFsGB05YFEme86MHO9gHbjlgQJ0kHh+3MyZgpTUnsCrczpN8/Bz9SVIVPYICjkZrxc1xDg8sTO7w8cOK74K9ssvlUXzHI8z/9DG4UtOvrbySPxhSRzyiSvIqejUBhBFas+pZx7Wt6BvzKhCTF/rl26wGBYYABzf5AHMiJUBidFboin9JkjWs6KZBA1FKhEdvMbAwVOI9whw5z6+ktMni8kRAsUTwKg6k3+Wv5pEafPo2R6+1UMCqINRp1mlwy2cKnJbk2irEh8f/5bG+GSsGSMruixAzg5II60U1W6i0Li3WrO6BYkEI/tHSrS6VPXaFnFVTO6YFTOlizDColXSlAKrAoRlsMRKG8X7Ddgm0rudukE/Zp9HaV1Rkl+jMTkdVhIzyFCqDZCdhqppLKGNhbvpF1DPUqUVEFQAIV2m6z2WGE1iMSJoiW1bNR0LZ8sxDpn+r1HyqWJnYpwlAR6jFcAc6uN7RWoHjBrXwDM/PVaVeWdzWmLkFFJW8csbuFBvIrnmRmUA/g15DPTfLTsuaxMNJkzmJS26kWrsPykeKbyd7q3Ghl/v8w8tYxHURUSvz6qc9MPIRvX8YqmWB5JY/zflgTkNFz/S1HwU8qzAwsHR0SV0YjSCGGhH8/ea1bOCwBAcDI2Vq6stxvH+Sbar/rRD5XyboF6bBTFbAtc0Mg6VWdrroAWlfIydSdWPuG2OTzH5BKh8ABI/vkT70qHij8t+I5WMVrXqnqPjatCRTXJjO9jNbTSWANmHZL7nGQmq8jAytGiQZuNbBYPFlxJX9c2NWoPb5/B91zeuZCX6krlhoAMkD/Tn899g7AgCo3yqufe5HR+89RCFKNHBjh7TZG0rAbOxbp/ONNzCzxqx+es5uZYfNv+nuPQ9q/w5uALO1LsvDs+T19R3slVSpir+Hvy1xfACmFyLGE2g6K2Xdj3sbrvzaweBy2s0frymbpmTNHhwZuELCZwvIOk4nsdewokp+cXireq2oY1waNKdLGdTlpGEwj6P73HZz3lpWRoFP/F1ac6ctE3Yttge8CCZoLuaMsLy8ksUrnaCFxe9PEiwhmzkCHHb3OYOWlZRw9tOYwun8uSVwxvma0VCSTL9iPiOpAgyOAkZ/o+/8e2XNf43rPWB76CffAQVNPFI1UlLKd4yb94nsfJ/d3jIfaZpAGEykocanBEqdtnRvljHUUnrCV5pBB6DeBJmUsYYPd8VaNaoq4rCb7g5fz9KyS5XEGGzAZRPCOt7KYrRasSqvvT5AC4uFCRir5wJIszjEMt6aADFJTCb3XYSp4xW1XXP7wazfXGWxqQ98jJP/mL+c7BK41bN+29uxGyz973mqbXYBYGMvxS30lS5uzyPHSOy81UYi7IwjVaqXkveP8TNe83lY+5UDJQT/Jj0AktMQ04k74CKUDR6x7+0laRnW3laVYdFPIKcLMD3q1NLtSVBwmtscx+yhD2cXixctnAqGTl/7r7uWUoX0PSRfJcq4dJj4MiVFLfRrP0d5k6V1IbJfgsTWc8bTNV8JKtd55OC2NCsAzJ983FbBceYFy/5iXDjg2MeZarQnhMRskRVF06SOJL+FfzOYG4M91CQCfMTPrGKK0T1zq6Aajrwo85dTfQHwhQ+Yuc6JqO2CGTj1Dv5g6zjtAjVv71RZb1EuTfEKjf/TV9hjd/SjURZ7pf53g8xz49xnxBB22ziIGS1BOtMxsaIV3QJb3oPeBT2tEJvzkDyoHirb4sZF5n1ysOms7sYJdGH5RW1/w3q6zarpPFQPUNKGsukkB67BAanSntvjPjxV13wdxPLhgX/Bcxc4k42y5EkltcAPbX7hLQguZGZSaehO0+yTJjOxVUg7APlf7Sk4brRfS9zzGAeZhyl9uMVz9Lbi0yLInTpUCRhLRsaM2XrDD0Ow1e3hGepYoFVRnopWUzdCtaZeyVaXriIEX7K8QWk/khLZY/QRzRS169E7VzZmQOl5HC721w5IxqrybR7PSX9KBT1yv7vdoSl87bA8Zvt+K1jmqxSCsvRt82X9WJgqu8zadCl6DR2b0GMvrq5nF2dxZT5BdvAg53Fv1AXrYe2K27/3xGeIhXLOhslFnDE6BLYQRgJAHXs16noHYRtXPnvlB8PX7BnzCFq+IahRsks5TGbanmCDb4i9BtYVKDCCQMmVhN9x1XGfhh+HjnFwkxUTnQoHatgtq5UxDcFYe7eXbaP9/Om4vaXeSGkrM2NTYt9iO2347Wo1tIn/Soe0LEURZCDW7Y2TQOQ5W6TxR98HHmw7rvNpm5Hs/B7yyrVmMPQNHewei9gqFyVkLcHS0ZAMXXY3gD9S3rPIudN+aHG59bLenh0+CAjK2KeoO2FYEFVoXHoR3SQkOlJTEhrqziIV1omqG9vw/6Z2arLIiuS+6bAVhJPp6xSKQlEoDIMNBijZajQtOFQKlPQWlDObYfHCNA89jYORe5M2DRpYgEaj9glCisis9N2LrwvxYxC3KRhHkmzeDMb1JCN407L6wJsZV99NLY4Z4KM5qLlB3rGshehNzeNWpBXiB9M7uzl/zDGLQGoc1AU3AZV+P3i906xFZ8xi/MqpTUMqQ55LOLL+oxogXZ9CUqy2zZ5aOQhQ+oPnxDGDlQR8XWnbGTIBdZkYgrYeJOwaZwnxkh4w9M5b4XZkirkwrDSdZOQi2ZF1+TrVysgs5vR6/VdXqzjShRD2yv0v7ms/peeePaq/Qi/Y/9B9bArGMyDH/36lN+kYKBCzfTZFw0pD28qxIbQsQBwgfUFrNmljMOnz8vZLQJmQRSG3tJwLilgY5aXeiGUKAOLpk9a9K/NxntV+muGooii52UpDlQB/Ac2WUmKyOqOkNXAn78lqDHVbAnCmsqgMxH3uaj2x4fuvxdE4wkXlft2fzKhOLsQ6ZSw879H7qVkCptpdCkZRnOz5jiRYRp98sIONb191eOWI6BaJCXuR2xnVJ/PYIHZ/CkWwj6FMyYVMuGbgJZts5N0g2lgYSqrNiUTjEemd6YimeCP1ZlAcNrbRi8I6HUI8B3yzT6GI7HdnRMXwQE9bbYxNsSTNSPR98nEKzsvURHWXelNcxtSWrQkP6A/hnXWst0rLTmgpiiW3VZ1I7OxAVpFi4mQBEv++eELdTux7W+3mWm8JWxzyjJQijk5eBCHLxB7DbHstm9M0V9Sz/lcQ0UKUXvEsaiSOtTWS9geUNCJNfAWD6/DB5olylDVx6rzJQRTg+eqVJ5Ytzzji5b1XXRaQEpgjOXUqX6x/CH+h1AOv4nqvowAIfJSlcr+VYWQEVZK9vIUUYv3mpsVwxMnSzuHnHxxFsfqlkuRQ8VWssuQ2hqlX+0Lc4Iu8ePZjPxF3poND0YMrql2bHtArMKbR/NZVtTpJOUAUxrWlO4JnSHz2lU41izpgOa8I38At66Ore2QJoE2FZT1pO9yBdR1ZmzcMHFYEo0fh7hhcV07JPmfsB25l8JvBQeEdRl5MUlXTOBzO+1VWgcA4t4bOTKML/uFGMzuUWByB9cLMLXnqA8E0qmnQRiw+qcq4pjibpDd8l73pHbkNjbJZfv2fCD6NYxlru+waTMYGGkCpkIaJbCQrdoY3bWttUeTH/9cH80FvZaATnYoq8mxiHYBvJocjoEyy/8/hKodlZ+B3GAZoipOvqdW50R9Aau3zMX/56jv61WjriLu1pSmlNyaMQWmZgUEUZCbFJoofILPsX828Ep/t5Y9HLBC4fLcdao7UM8/pgHy5skmsq8MWpSY3uagxxFT6UK/iVr4ZTtj+LnqaYjfE2eAda+44T1hDW8i/ynT8ZFASZ7DwP4tPotHcLqsqFIFTL/iTjzCMkeV0NqmZOxvVEaIvbc74cikxKfamzr/Qetc1ynuZ8VqHmTF/jXOZqSCBIIDdcUPsvcJ68f6muAz4E866V8f7njTyhsv9UBEQJoovTjDxmf8NIy4sxv1SUxwhZMBopCqy/bNNYocyXcdhkibeghWdtpEPaiyCCmkqPYZNfJka9+OaFJY5PBSKWyiziWGHg8pNJ6+ofaHdzzFF5mSG2Uq8uccoguZ5kL+GzetbehjQ4cyPz0iY4QuhnM/enF5sqWvt8fFE6oiL2L0RRRSv7Zakx4Tr5BoLBeO1olK2xGTP4hRn4gcLXiiubqQ90ZxO1/WbseSOw9qhGUASDB2vqQ3qvBoII09wNgqSpV3rFu+wg16nD3GenqYWfpm4WqaNw9RoO1XMd+/acs5DUMZix6YBT3n8zjLuQJXSZHWCSUXRcuW0L+xT98dsPcH1ylJcXsJKxRtbIQ44d4ZwnonGNLjiHSB01BX0EfVXFKjL2rQuaXuxhdmwIkadXl50HYFxrS/2/1YJ4uayUhaBjJCW1BK+h0WYR0rYhrJ7bQFsh8zWOBvXB7JWxmihKi47mHr6KupJccMnWT63YIBcBuV0wcta4MsRdLHW77VTHLvWw7Hg9OIIDsBkkDqU8NfXpomx/wgsG4K4e3YoJwxMGPyXbTvBPGgbtVg28088WKS1R30Cllz77ZXWWs79gzSHYcHEPX9Cx05jYRURLEgbp0l0QJ3XjqT6K9pv1CL5fi2qODx9g05SquGI3BAqx9+pgz1A70rolsllaeWz/cjaX30sedkXNBp/emDZzuGgqKWLV0GxnwNAwgGpOvc8bAmpasb+gz0HeDBDVq5XWgGMKruiyg+qehdS3ep9O84G9Hy0omsV6KXHO5sqdg8epB9zSeH8seb1xec2yUNbqyfsBQEYjQqfvTv+lGmuQpQO5ITE/yCSWXPQpcC71OYX29sQbbpJgKb2ioz5hWXsPwl+ZsvxNH8V9sd0NaUQ+fWtikybZFmMK5YlytDlfRdavu/qblmaMIRPcqpb+xLEXQqzEbrIJM4e1q8nLkwbkhxf/uBlga5PiE16A0Zji3qBn7WMBA8R7t28UG48b8yCXSOxoA27Ag8wJ4rbmV/n9tvIfQ7t5tPqCjOmhpJe5LpAjxmA4d4ScC2xFEQVxvIT5Kel+48oLNU9en4GciE4/0hh3d9bxnaNkSGDGoo0xUbJyobFX1OwZNx6yCm0SUjhf/43c6GjIRbNh5KyNkYBDQcitF4OAXXQNa8gK/RUmDaO40PG9j1ozmLEm9ZNAXNEJsTGa9CeyoZ1ENe3lWPNvc5OmHJLzzpHc5+w+zeOR3wI1s1lAF/QAyHdyQmeyrpSifvCNBq2pTDnrTXg/YFNhHLx69XgbeiHpB+iKRHg3JtXn751seSwDWGaEj1mvUyshFBe+0dwYThbFaJhQakkwW6LH/D9e6UsXL9WxkaA9WCTp7J/WTWIbJP4bvipHyV6E0geOm8dQbu5BLgVmltRgqnztbjfbE53SE47FmMFencSfG+vZE2nnIeVDYWkD8lMoWDomDHwUwPNK2JNHuf8GjNaUier/cPGJJfiz+SzFjmY5MyNp7Vyn+2jv5kxT8c8KflW15oFe+HE67KVXb28DluqdOTh9Ld98EkUj/rNxgJG9aC1OEWILxMr+BAm67sQVwj1ddntRshqtOnNjWejb5bAlwxHEGkjshbSFY9hIdUtndRJMaflUOFxq55TeTqms4x9q+B2V/g1c8atPZa471nNTh2fkw6j85hZps46bOv7gfmnMhLHzus/mb0ZTEtJodM4BOE3eYaFwpdeGozRvW2ih4L1/D9RTIRQ0i9E3dpUe3E/uWlOBVrZF5hpYnQ9S+ONqXq44FezE1OFORCIr11Yt40zXja7Ftlt4Pq1rBB3wFzlpGxYMuDPYkq+tXLZ1/k7Kx4vtDwmh+n4V5NoE7HNrhleBcTRvbW7sXX6oireS6EOsdFBaUZWIm+GgtLonr9JInGgdLTnQ1yFcMdepv7J0v8f0KVxjAuq9Tdvu2bdLmMrJ0jC5bV79AUyO2A2/Pi0yYPu5yjVvNU25fKprgbjVATtwrKz0ejzrl22mQOuZdJEYir7pMXBwFMgMkcazG71Qt7rUyODp2a6HSil0UTx9oqCiMeujOMd2b8h4KwbiprWC+IqW8rtFKhI8Uesr9aRIroe2WUtFoWQtlIh7Z7ILWeZz79lJy4xMCFLs7O6T+cNE8a5ldCGdU3sFMN81LQDGVIFmppsnSDb9vclhSFh0yyZYHPrcRg9PnYnIrcs3rYmrXxPpGHA2pKVz5m4LDgRuhMO+Tx6EGSfh2h9t9mYRsHx0Vzlk5b1jHHhwMLAIaKlZo0f1rhgHdJ9P8mLXjR58m+XlGamXVP/ubRrjYZy6y7l1bYDFs0ZeTFvoP6BvAk36tX/51wA28ueLMZB7I+MBy3RJgPRzD/cm6kfHgby7EhF6L/R+AmZYRugALWu7zmPwxrRnZWC6SCSf/WtQwVZ+8kiITB0IAY8PHsQlaV7O4XjpB3DOaEHXHdERMiMxQtWwaVrbKQBHOFT20bblE+zVufiP4Sldiuvx8nrhJYJFNu9EODC0lkKpkmrLdnqpUxssreK6/gnTDhETuV83ghhLITeTeYV2V2pU3jHzJ7X3olunA7Vhq02K8QNp8n/+chYWK/ZWwjysEw2kEpiHrVdX0TSypnMYmFqhMyyowmGCVWrcawUuLRSRp5+nXyfbRmicXJDu1UFfqqu7Vnxsti22mBuWBhCfuDLalqp56C6EtUiHrl0HZNLaCAyJ/DdyrgUHeZLXxU/lrp1rsdB1JvDoxz0SH3RPVvOsiM0dnWbcRCyvIc2HZXl4G1t2jYDCNMZXY+GrZdRSFDyxzi/mwrZ+syPJVXVnBITUjlq8WFxc0tK2Co0kGqbLTNokuMEH9n0KpqgPRMNzPeKTWSUp4bYhpQlWrvQSEf6YPJVNgjLyoZKbaMOcfJLTmovIxCXZrw/sW34lMGKI23pVK3nas/ww9OKh0Gh7RhailPpMH+1VQEO3O6jD0b9mbduPFQJm5HxUuTQecaoLEvL7BsAUbJu64VBe6GeUnHeVzWBEdbli0bLo3xZ4/YHTI/xyrAWYRyBB4YWwB0gVH+UmX/lvYed0uoLJA6pSDLko0mtsoOzjkIhrJ4/6cnS2HoEJpEwzZHk/x17moOwnHaJuw2kGh9WdDlNMsDnd62GTuTRtMuCw0fSOhqs+FkBgbg3AGz/O4XZUAqyifTMp+eDr7zxZmURUQvRdGNDG3nAE3b6QO6yWZw8W6YMflYj0YGM+d0cmaZ6Ykboh6OqLeW/BwXQz0IgHIlfOHFsLEnRJs6MTt+wueZzXrXJO8o+8zP3X2bxKK6+otFoOZOY9RH/jy7FSMBRoCHHzSr1Vwg4fbMqlnDjTfzj7j8DAzccw77NI5lVmM5oUC+LgERkkFRsD4YwKGsEz4H9TKCBM6OMOC5WnbSX2q7T5+uNNtLRjkKnq1bH+oUA/AYTmjp30Iuv7/RpQRxHzc/5oAVyZq92q0zIRGmbOjlkZfkSxSF2bAI0VTRih2mNIZuIuzBAERVGDRUnpECNJcRCnVTSS6kghavmvQ5TLXenzyDqIqIFeVnTsmC1KbTb6bLGPsYg8HWh+xaneGYeZVgyhATtLQxsAZIU6wkcarRq9GsvzBRMBOxuJ5JaHoDpA9Q5labgxF1gCYW8HoxZjvfE6r6ZJ0GagJLP04rOuh8gGQpHJOAZbhkT+JCysm6AKiDlhRhLb4iaIkx9sbCzYrox1MIrPyCCMIdt9eLpZQxZIpSt7q6eJZAOcUlTxwoSPxCRDqbJjn/m3Ec9BUEnSh/cvzVB73VPue9P3aw+WJm5ljrSxxIgqRo15rqrHDWocZOz+JImzOTHwjg/mrEvAx/jXgFLKS/ipcA1N1gYzqeXUk16IRf4TjKs7U+LEcybZdDeeUQsMW5zhsKzNzaObgcbhYwYYfgK7TCyrlRm3e+GZcWb8IgUy32EcuTDelnBHJ//yQP34skQTs2aVm/O2YXoTXogwgo5Zc2BUFsUGaDDVi0MeX5K/bcDKZY8vykh5+aADRXlQp7yXqob6LaPJE4xlrQ/Ry1nMV61uCF6mieQpTUfXD978tLOp8+mPIcuWcNnkkJwaA3C2XwLETnIosKpmx42w6jKDLm1sWDqwzJHyjlOvGx9Ytrhw9YCzNHsmgiYy7tjvDphMApgHHj1QCeVBM/MDthum62dSG12kKwQwjIs9/wNNKVAeqQS5FIHWrhJ+jGaelYl6xnRVSIOlLMkeCmbjO/nSa7+ig3VzvydPPM/iAQgjM/ZUAfMjruUcX/Eq+9D9gKq73laThX8NXF7JRhooZIh+EriPmbFNOXyAeIqM6ChU3F1zV39Kd1AcJCoiu/punU/euh7SR39m1YEzi+FY+Q3IL3kA6R0afklI6c6wlOnwbSSCyq1nKks7DL6Jxtxs9zcw0Ss/xLkvMU/6oeT4bod/ZtHCOssp6e5qVvprNfGU+kICQo3DiXcdJIuWFB1wUsvMXmlMnnHTW02jfIsQM28QjAZjgEwkHIxTMwMDFrqPVvIJR6M6x5Jv3WvcHNuOV3fYX11LhZGafGJTm8pVIcbEZWTM2YHGGt9mkh+ZFVwKzv+jdPVCLs0sFZxOEP9zdGlZ2zsXSzm4B6VP/UzgwZWG4yjZwvStESnJyegTpbR7K/AcVm99Tc7156oDv2y4sNtoHT1XDwAe+ZhYpIOREtvbqguPJIh3zI9StNozNuIDezapQ4oZp4Qa0mF3pnXQ4TiLPZKSm+0IRJHJ0HyuPJx7jQvw5ApS+/Cahm5UT334xsaSRsg86hfaDVz726tfCfYjcvGvj8qh1CspD4Bzz89tqDCzSTyrSF7C3jGzMrs/EQG3Tarvh6HDY5VSwM/7mVecA2DZdccvcYTV1qnYUq8HHndvWZM+XgDmKqpv69z0PXYrOqx1V8nEbw01D8yGMMnigsgnZHWiK3BL+F4xZqFjalkzZP+lHeI241/uEvwxin0b/91iSesFDWvmYUeOLR7AhSD2VjLTUFXcQWu/f60be08Fzd740HZ1GKUTCuRKD7CP6rF/zeEP7/QzDgMYHwS0y+rMPP9ydf4BGTFayUKzvEBhOS3QOk3zPuZ2Ncg2W2RPG8zQd7AZYL5B10/s6Mr8SgM5iwWzAIvHvAJGxuJa+ZiK/6sFwG5zwOwW97bPUk4yd4xqRZBSNVw12Prlg/1BEULLbqfNK+Z8gfnfrdDebdVUehqyl0fXqYKf7p203ROUsZgC1JumPYOdl4nHKX7x2zscIK9qkyi/k6e/gy7IgTuVVp550fMjxjwTkvb/BUhJRPK5Oo8u4wT9h9spCSvSufquUoPKxJZ42m0kshF58juZAPWajLD4PHlJnSC5jL4lseFwm07Q+aPQRXrm/u48aHkChgK2PokYVxtZnps/rIvQUr0CD/oguun+l1gT4xYkVTEVoQiEjSUmS5MEzrvALgJE4AMQ7XnFMyVUavfrR3ZWqHcF/Xr6p2RJkFPdz4s/o6+jl1SGxOzdb8FnMzzOewlFE1nLRT+i+L5HrNpGmF8v0XYMVk/MXYHdKih4QzqEH4hOKIcu+zlWqy60osAg6Xrpjmg44lMH4W+OXaNFEasXK1elSefeugfNdfDHFS/NDExA91HyGZ2gjMrFh6qwOWyZEXgflEPPJu7OPlANTQAItDeKKaI5iD7IVyqlyACziOlsf3yf6h4F74yh0qFqpA27LLxiSXMbejPWs9sz8KO+PHxWVq3hPqn+yhRXTgdBsTOMAUaRtUfKF4T6moXfN9JwOUzZbv600HOWMfU5/nKcq7V+v2KZ4AcVhwqXHmU9bG9ibiPRk+avuyLBN9sWmiDn05vscf9mnDnabY/wmzERewBS8lA836kBiYlqMzaKFk+fSIHq2H+x5jz9lniZS+GDyezmOOQxZazYNllLMbot1mxaI9Dsu4bCwqvf0lc4W6BxYvH1nBJw5PRjJcrhbS0VTgtrHmrA8em0PgNle+5rHSN3tbevhTE2ESP163Y8vOtk3kHobvqyhp7RcayW3/fznLh7QAJKB+B47a2bRyjrK6GDSG7K35N7pQFyx37U74kGegteo69jnEiq0wYvBtOMhg2xZySCl5fBWav9vyvMCBThv1wzqW3nwJRxfqZmtqeCgzf7lUk2l/ZhemeLY7q3NUs7EVT1ZN88LrKYnkm3b46f0/XSK3zINiBMoa23oFg50mBb/zDkgcHG9TCIRH527ntN2EmpXNO8sIH6Cvx4mOqx5f+k2b7+hFrnRhhsibmE/NPpIiV3f9b4ccJLaIjIG442xoKfvzt5i0r1ScvjPbrtc8N+Guud0ga1HUkhVSB6PRFuIONt1M1FWrt5R9MW+YE09utdvMPea+4EoqzP59OoYHAYm/YvZS5M6SNCjYI1fgyx8tuOm5fO63MyzESUjHO7cWPMrsfg9E5riYe0Bo0LOhMVfZmE3IUI8fQsoCO6jMlhipE7u7lOzemzWmvtj9VP4j8qAUn4K+6R2WND7+y94MqqG3zI+b0+k+omQUhDxH7QGmypObRp26XCpHZZ3R84ifarcKxVos0nYFG3557TN1W/qbE0JHuNh8P1cBFM66TvWwbIOaX2bOe3HQz/4HfBjKxZh2dNvq15+VRziRstEvpoq6mGShiW6K95TbEDWairyA9ffPpGTJeHoIVxPmj1dKngEV3JELcX6tu4qpeg4Nybcl/pKF2YJu9zAxIj/L2s8kZdG4XkJAsJPP4w/QLBtL3FscWrYIxYlD+d+f4wF5IFkT0ZKX2S7X/uaiz7YLzoTGZOPP5QaoKXMyGyjQh/y5i2/rFg46CncCaE3dnDmOXtKS6quZp3mhIlqvdMdDvPJpxVcxocyzRwVeOYTbQNjJMvH6Kbr0wFtvUfHcd61p7zSjDxlKjh3l3he/lluDjWdfPZawtQtAYo9AM3M2LntpdmVpko7qrbPteaqEY8eJ/ptHhizjYE45BjFOmGKjz2sFwYG3TODZ3+QxFjbQPy6Uf7lCdIe0bxlGv8Lzpr+K68M12evpJICKtjNWixbb0cWcZKnDSk/EmMEgA/xt9JYMz8Ho71XMk6U3osuSFwj2aqbmVfIHAefC7oZHj0UFQtuqYW659EWJlkGAFbLWOhKc6UjGUmb+0SRZjIxPMlwDhbnjJz4Cn8U/uGyQEPlxRzGg1WlLx6mxqxvwwWsbMqU5/LpjVyhK//N8t6qIz5XZnLtk0hVtvlNiSsxagdR6LcctMONzJ8lsxqPLP3zSzQQrfkqEN3RL91ABHIOASZFUOVKq/2LhHpPhtIw90mh/mb+KdWYA4Nc7UD+H+aEGhq+qw91Upuie3cvQfdetFG0JL6M1X8CvVbdl8JxAFYm0HganmWx59fYu920V1TfW4JWGZyDUn+6BsPHXp76qkgp/gFau+3evjLhrf1KIa+BGpIqilTbDarokhkhgEisJvLNQdXnlf91QQkQkIWjNz43XmYHiyrgPwC+2kTc3F9YU7kCDsUXfyhclt8emxLxXWlciNl83HvuuNBPVo8YL+lS5SHpkc5gEiWdsqzO/32kGLrmF/WFDcRqJIyXqDpemwslHSlTLE1ohrHV9bUEjn5z7330t7ssS505LqxKOlAgHMDXPwRXRYKM/7JhZcssT6QvTz5Wuhadr9c3VH4xkIzaJfJx7OFViMbUtl7axDsJHlv4NstgxpC+rtIkk/++C4V2dRzn6i0g09FEbsPx17lripCxPE2lxM74m1TfiwPSmFpwfQ1AtcB8BBDXKRj9WZo7pqeTQ7Xhs1xUuApm2xMAcGepjFC1OKc6Yx+DheUHt7Sd8HcEIYRiZ+ivh1dSgcHLCPgvkKMcBcKbMbnp0x7r/vA0DCAlwz2TUsqkrm2Rf0sTnVWCUBLQe72kwQwo/wSVhTz40wyLGe9DF1SKGFQ8g9SH+3hA7C0P2jdTQOFF9z6Zn1R6qA3Xw5/iNjuehJhbdKIUMaHYL9D4/bHc0O69GHTwRCVCfiTUDvzacHqkSqqZ4LGhe6ALgXuC2hje2sK9Fg/+BibYYMap4yreFlf45sWdZFzKkBYqx+27pzGl7FBfPqK5oSBNKwZfsGDiOgigtNG9Qz/00LrYnNROXBKb8LT6HOuim2T7fVDjZgsuCqVOceRuMd2cYIqt2ujoASV07FdHfltsuc55LdgVK+tyfUkwmPxcx79xPnmwkV+dCt47CMiDlogN7a/wkwL5oEUZhCOZUw+8eF9OfYMqfhc85KwsDcrR+l3aYqMdpIAWSfJPGHj7n03gctDz4H212OFGljYWHmVhnnUhErNGAam/9MCFXjHs6w5H1kw3IDnlMYQ6lR3zsmpZGXd10Z1a/fk4j5WzOumRNWdxxZMJ/gt54O2ybrH61yH1nLav4ew9ylhEY8DWkwTiDCrdaXrnzcJ5uXEmUu6q0CRVMqGj5ZBOdC47gM0YpbyOauRoU734Lq4fcGNyprbH+rpiUp7WIkJy1oPfThFfuIMuW0V2FB0FV8SfOhg7NUhsfxXgLHzgKw10WDpCMFtRu4GGFViZZgmmXdFlKm38K0Gjap02RntcnPP0buYsU7UHoY8QXsaagDItE2p5Di1ErrF1jfFLCNuYZWt6nvC0PEqvCR9jDOZ2QnLmTOkDaBglu+2bhEdwrbf49DQNGKwWvqtzxxx84Y832HPaJYDKtb7YYgqVvLhNKNk+xJ5HFL+coe9P3EboSSfaAkX3ZTd22oQottmhSUuRkZt2QfkUs06bZ52f33sT4Ib0Ig0lXD5UqaLaShVF2X/WFodWuhTOhwjrwFQXa2pd+/wdRUEA3IgexkJJlh0RL8/B+MCzUUC/esx/IuIb+HiIMpuua5AzTRiIR/aEtWJYQfs5r5iDm1mnR0Z4kb5s4AwN84H4CbfwC2PMVL6F0lf6O8DwSEZ/7ip6TzhcuUTkD5bkXM4tF2Y63AQnXWgTHYSBP49fvlOMUkMEfKV2pEb+koymEC6pDqfhIUBYduFqCE21lV7i/svosLgwLYu2UYqFPvAxWf28EKkLZHU+eUEJFgpjaLQOubQqa0NVbk15gnDqMi4h5r6w2fLAegvdwZYVMlM+u5yccp8kwv0mx1cRgxwDPXAIwuZCjhTEfI7U6iEseEsdsonZUPDQZewnArvudj/cyRRtcX7A82VL8W/vcaZVxY0GChXtAqlXiKn64yADcsUJNVhQXrXJemYp4OMWi2BrI9+9/Fn1tvrMrR1zXS0ZFM1Fhgi1Dkk/DeDfud60LR5jaACp09bXkrF93Sc3wYVuhUDj24AUy292qrFa4SY/9QGHdEFO59yC7e7ysnriOvaBakDkLIvVjNrC0JgJ70rD/P0x1ISp90quD0rIClEPP7fqJwBXC1hIFYLOY9ipLqQSdhybI1VC9oS5fQ5vzn+gzXXREhkEvfNhM0+8wYO8JUSfO/qz3FJVQiHA+Q5n+EZybxFt2baX3PlQNX8PB+Jns0FIMi8s0YDArtNqoscNVg3qWVsMHGRgEEFra5y1mta90QF9RL7dN+NkMUGGy5Zq+WfHhtIRsD4MdsJ5U0vH7TT8HTe02FmOyurJW0uVH1opA7Gxods5ZMWnowj4QbRyvjAjDfEuFFUHBGDtlxz1Srx5Km9S2E0hY+D3xgx5aLwHRvc9cQM0/OpRJO8HrTBduHYGGkSwFLRDrJBlM3EgYaQvpLwF97gkWeiv07q8b3RQNL4/tTBL2D5qdmaTU1K2dDOijYSpYnTlhHS+HfxroCpS0VDwuq5bmBDh+4fGXJJxOxKQRY1p63zhhrVoEf+68HxwuzYgXETeVQY9ngJTZ0/jPn6cRYvC3YX+36B1SkWfKR3pUSkqT4UW7E55q45N+vWRCO6s7GtBfy/yG8BNZGjIFJKDAwESWpi3fRYhFEgb85TtDwy/Skh133Wjy+gWQR/hVSR9Qq3mp6JvVMwal9KYzRxiUznm9gG3k+09cfmevJxswCtYcAXqN6Sooo239wvgkadgb2XOfAmQuMMO7B8IE9yD1JJePkm+I80mmzPD8sFjL/uU5MnlFaTDTc/5xfjxsJ3fHpvPau7Msao3D3fPyRDVgfnI535zO7SVe6Hrx0epn3LJ2fO0J0KcQYtb06kahN3c02mY8JCMW2xW8/GLmuBcAu1/J3MtbFBk2muqUhE+c+oMWAs1ubnPgFKSWF8vMU2sBH1r9Q4Zkh71KRdNBXzSpw0lMAhtp9YYQyt1II+NKpx3dCbhQyVZxrkiO5p1XGcDAkOmwsPXFysKCRJl5yM+KW2VadkXHl06Qs/39pPgaU1St4J5SEx6pQRReL9pBOkwUwrF/kevqYzebkks43bKkLj3fuvzNuugT+3ushmc7yqIWeae5zJadSXb0tFtJ36g25klLuJGcmQzaIugsWE+LTI2AeCEhOQme44q/zPyOU8bROJR7io6ZzD0ZUDYQBi5g49M8/P5N3A9Lg1Yn2keUImbxICkDeV1K0E9+2dgsEnRGzMKJFOuyfovs3cGVTPBKAAmXbeF50eK6Vt5sKU8PTHh7tFo3P/0dA6I/IWNYYeM94d/l+b2iyEcFmdkbQnXNRG/LaQA60BvZBVAYnFIteYteHcBLrS1uoTgtUnYadx/eJN48uD3N+jb/PfX0Lh9Do43Tj4oIbvOmPyFM7U8jYuSVDOZgxhVR8bFaAzG//mTJw3PaMh89W6JamyqzwGh8PWdMu66F2L0glfHnB+HFrBLw+qWnxri9nj8XrhJwMGaCjBBiGNkQaMGsYW9xBuq+I9veX0OfmM/G0aKnaE8wDMgqmecHKiJ5UH7TwplBNzj4EDKVUNO3RZ0b8C82UCrht+W1VlM0E9+oik0azlD8uPSL5POJ7qDmHUt9x1gPTo1cvdmXlxEGbb51MkQMP89bQWrA8906UPPV1WVJ37B1YDwVNJoG3oY/J0SmeBWjpAkdXOjvh0GzOv31MyDAJyZbyIy5iN0CGwXaKmJrTxom240us/8wfDR5TEjIbCh1dbOoVv0+zwMvN0wjtEHFWMQ8ObCJhKJ/O1EOguEoFvtJfQbm3SByJHxaR37dn0gg0f4VWyM92Gow4t1SiFHIlmcx5nBaspnxUK58ZAr+9zn5IJr+fBZWldFGAgKPnFVbrzSUfRq8I34Livt3zcTWWlXbEEyoxfW58RgQZhdYTLNbAL1euUbfdZe02Jj7LFTdeHuKgvHbt4k3tvGM2UZTyeJtBzV6YzzA4Ww3BYOWXpyh5AzAMmPgQUOSjckDGF+fhJC2mzsTpHP+G2jM3TRhdVxNeGgxO8eEx6d59Lul77OQVObdNcCmuhhholvW2Xfx63oodhABKy1dV02PkQ5JKazlcQGidked9YWTOIqPcArLgRmtJybWmD2ghKFUbJ9rO1p/Azz4NOBkUpMJbvI/RWnvUdHBIFLlukae4yifHn4736AlzEmBenBIY4ZtiZsMaUbOjogkUtKYjd/StMhgQ42tpZULtj0iyXBj0nRKw3pWWBdzkYw8GJvSTmT39/ybPDub2GEVGJdIfqMseRNkS1ulpa89lhLwE8yS3R1sR+9CWv9tsHi2bVbZUwecPNu49pvpkQ2ZpumF+2V26Nv3oSy2TQQ3NF0rdkCnq+ibE6LVrkZUpijLcML8MVRWVilRVp4GmRuDYVZkvQep2CVhMmiUZ3anoqModRnuPQtmWs4l43VGvIhLIW3XVPKMaItryTs1HVGIFrKccXKwIwBEQRpNxoYxOgbPXC4jRSy1fUDckr2CI6FjdWJ6oJFZtSy0dRjabdfVApvzpORzPbTnW3tPcdgsiDi+nMMCfTCMjBlbXcplhyq1Lyulzwn4vGZ51rKJhRHKwuvxqE6GJq7J11C+V9FSNypilLnbiOBa7IyUmwgqRkeKGf8wR3LfGfhe4FtEluOWDLEZNecjfLlX/0d1nMEzmT3tJhEsof50F5eWulxsJq21cJwJaVMAlBIQXhnqseDxN5r53VIOKSYMBrjwyyHXIeIyMT+iiJEiSGrrhq3H7QD0wtGuEDZLnigYtvMn5GRa7EQj2iMyzRmO4x4BIJLDXkivZVbGsFdtMQW+l1Vh55BeP8iIsqmMdPFM7w97UfZ74kb3v/+LwEQz3/ZGZPoabjSFIHOytrt8l+Pv1M4GstUiKncLXEMIja8+DTHGvVgyOfw/uyZJ7LaSKKzZfSEAMmTB0hzrsGnALPLIthpt8gUSbj5j40oWxP2FmNvCOIYbtoa6IaYSBXJCoHBbMiPp80TgTqAkzK7N0VDvZ+BT9BCMUO7DY3NsUO4EPD9tC3WfojqAMbh3L1tz7VH+drW1F983/Fpte0neCbkxoLqri7mwVoRSGb3Vu8ZgTfS6jOu9YikxgjBmp8W3PAMS/Qyw2mlI9+7O/FnB/R1cs0ew3BIXDLqinMAt75mIcfg0VqEiMu1A2MIbE6yQn4T/O3xb1LK54x4f2ImXQJUn945LaZgJou/SDKBMpaghJcUKdbNfOBlk1i4U5MB/bTRA3pBHQcSW9shJ78SNpxTRsdI9bsAJXnFpMyp1sb/zO+ViwTEoyBmKbE2VEU9/P9PVgFj3b0gAdjb6LifBQh2/20zwNgGFGypdW7PMGRJ0C3YH4ePCflNb7qM5ZrmBUUzdF5/XWXx8iNqT8oqOMkMwjpUNfIwtmgwp9V4bxDdx5piL6hqhFUTd90PF39dSLgQdFnnWIQF/COc6z7zMvMp+YP8cTsN+oYsL3z4hgBSasM6j34CtIzSn/KUdE3vQHK80Q+84UkEZyOuRIz34b1xMgzP0JU8I0yym1Xzl78mvwR+ZNOipAkD9Fi0i5VmpjV7tZn7Fn1Ax/VinktqLpQoSJylK1+x/W/jJ39TmUYe7DRD1kP0rtk0QzCc5cimavaLO/VkrSV1vP62tMdUXtMOkw5kxibDo8HRjO5BRd3OeBKHTALI18ToLSJidr2+ZxDD3w4KXu0TYRLF4ms11n2JdKFtk5KCec/bP//8sbNQ"));