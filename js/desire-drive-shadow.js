// AstrBot Desire System 2.0 启发 · 九维驱动力 shadow（v49.35）
// 只在本机推演连续状态；不注入 prompt、不生成念头、不改变角色回复。
(function () {
  "use strict";
  const DB = "lisa_desire_drive_shadow_v1", VER = 1;
  const CFG = {
    attachment:[35,.5,.3], curiosity:[45,.2,.1], reflection:[40,.15,.2], duty:[45,.1,.2], social:[40,.1,.15],
    fatigue:[25,0,.3], intimacy:[35,.3,.1], stress:[25,0,.2], joy:[35,0,.15]
  };
  const COUPLE = [["attachment","intimacy",.3],["stress","fatigue",.4],["fatigue","curiosity",-.3],["duty","stress",.1],
    ["reflection","stress",-.2],["attachment","stress",.1],["joy","stress",-.3],["joy","fatigue",-.2],["stress","joy",-.3],["intimacy","stress",-.3]];
  const EVENTS = { message:{attachment:-5,intimacy:3,joy:2,social:-4}, time:{} };
  const hash = v => { let h=5381,s=String(v||""); for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))>>>0; return h.toString(36); };
  const clamp = v => Math.max(0,Math.min(100,Number(v)||0));
  const fresh = c => ({ c, drives:Object.fromEntries(Object.entries(CFG).map(([k,v])=>[k,v[0]])), baselines:Object.fromEntries(Object.entries(CFG).map(([k,v])=>[k,v[0]])), t:Date.now(), ticks:0 });
  function step(raw, event, now) {
    const s = raw ? JSON.parse(JSON.stringify(raw)) : fresh("test"), at=now||Date.now(), hours=Math.max(.05,Math.min(24,(at-(s.t||at))/3600000));
    Object.entries(CFG).forEach(([k,v])=>{ const base=s.baselines[k], cur=s.drives[k]; let d=v[1]*hours; d += cur>base ? -v[2]*hours : cur<base ? v[2]*hours : 0; s.drives[k]=clamp(cur+d); });
    const pending=Object.fromEntries(Object.keys(CFG).map(k=>[k,0]));
    COUPLE.forEach(([a,b,n])=>{ pending[b]+=(s.drives[a]-s.baselines[a])/100*n*10*Math.min(1,hours); });
    Object.keys(pending).forEach(k=>{ s.drives[k]=clamp(s.drives[k]+pending[k]); });
    Object.entries(EVENTS[event]||{}).forEach(([k,d])=>{ const cur=s.drives[k], surprise=1+(d<0?cur:100-cur)/200; s.drives[k]=clamp(cur+d*surprise); });
    Object.keys(CFG).forEach(k=>{ s.baselines[k]=clamp(.995*s.baselines[k]+.005*s.drives[k]); });
    s.t=at; s.ticks=(s.ticks||0)+1;
    const ranked=Object.keys(CFG).map(k=>({ key:k,value:Math.round(s.drives[k]*10)/10,delta:Math.round((s.drives[k]-s.baselines[k])*10)/10 })).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
    s.top=ranked.slice(0,4); s.warnings=[];
    if(s.drives.fatigue>=80) s.warnings.push("fatigue_gate");
    if(Object.keys(CFG).some(k=>Math.abs(s.baselines[k]-CFG[k][0])>30)) s.warnings.push("baseline_drift");
    s.suppressed=[]; if(s.drives.duty>=80) s.suppressed.push("attachment"); if(s.drives.fatigue>=70) s.suppressed.push("social");
    return s;
  }
  let dbp; function open(){ if(dbp)return dbp; dbp=new Promise((res,rej)=>{const r=indexedDB.open(DB,VER);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains("states"))d.createObjectStore("states",{keyPath:"c"});if(!d.objectStoreNames.contains("audits"))d.createObjectStore("audits",{keyPath:"id",autoIncrement:true});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});return dbp; }
  const rq=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
  async function observe(charId,event){try{const c=hash(charId),db=await open(),tx=db.transaction(["states","audits"],"readwrite"),ss=tx.objectStore("states"),prev=await rq(ss.get(c)),next=step(prev||fresh(c),event||"time",Date.now());next.c=c;ss.put(next);tx.objectStore("audits").add({t:next.t,c,event:event||"time",top:next.top,warnings:next.warnings});}catch(e){}}
  async function status(charId){try{const db=await open(),tx=db.transaction("states","readonly"),s=await rq(tx.objectStore("states").get(hash(charId)));return s||fresh(hash(charId));}catch(e){return null;}}
  async function report(){try{const db=await open(),tx=db.transaction("states","readonly"),all=await rq(tx.objectStore("states").getAll());return{characters:all.length,states:all.map(s=>({c:s.c,ticks:s.ticks,top:s.top,warnings:s.warnings,suppressed:s.suppressed}))};}catch(e){return{error:"驱动力 shadow 读取失败"};}}
  window.DesireDriveShadow={step,observe,status,report,labels:{attachment:"依恋",curiosity:"好奇",reflection:"内省",duty:"责任",social:"社交",fatigue:"疲劳",intimacy:"亲密",stress:"压力",joy:"快乐"}};
})();
