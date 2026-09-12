'use strict';
const fs=require('node:fs');
const stats=a=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);const mean=a.reduce((s,x)=>s+x,0)/(a.length||1);return {mean,p95:a[Math.ceil(a.length*.95)-1],max:a.at(-1),std:Math.sqrt(a.reduce((s,x)=>s+(x-mean)**2,0)/(a.length||1))};};
for(const file of process.argv.slice(2)){
 const data=JSON.parse(fs.readFileSync(file));
 console.log(JSON.stringify({file,scenarios:data.map(({name,trace,inputAt,diagnostics})=>{
 const speeds=[[],[]],moving=[0,0];let frames=0;
 for(let i=1;i<trace.length;i++){const a=trace[i-1],b=trace[i];if(b.t-inputAt<300)continue;frames++;
 for(let p=0;p<2;p++){const d=Math.hypot(b.p[p].x-a.p[p].x,b.p[p].y-a.p[p].y);if(d>.01)moving[p]++;speeds[p].push(d*1000/(b.t-a.t));}}
 const initial=trace.filter(t=>t.t<inputAt).at(-1)||trace.find(t=>t.t>=inputAt),response=initial&&trace.find(t=>t.t>=inputAt&&Math.hypot(t.p[1].x-initial.p[1].x,t.p[1].y-initial.p[1].y)>.1);
 return {name,presentation:diagnostics.presentation,movingPercent:moving.map(n=>100*n/frames),speed:speeds.map(stats),localResponseMs:name==='p1'?null:response?.t-inputAt,drawMs:stats(trace.map(t=>t.cost)),bandwidth:diagnostics.bandwidth};})},null,2));
}
