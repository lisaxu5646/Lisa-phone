"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { JiwenEmotionA: A } = require("../js/jiwen.js");

const T0 = Date.UTC(2026,6,17,12,0,0);

test("统一模型恰好十维，旧 jiwen 五轴原值无损迁移", () => {
  const old={connection:.42,pride:.3,valence:-.2,arousal:.1,immersion:.7,lastTick:"2026-07-17T00:00:00Z"};
  const state=A.migrateLegacyFive(old,"char",T0);
  assert.equal(Object.keys(state.emotion.current).length,10);
  for(const key of ["connection","pride","valence","arousal","immersion"])assert.equal(state.emotion.current[key],old[key]);
  assert.equal(state.emotion.current.warmth,.35);
  assert.equal(state.legacyMeta.lastTick,old.lastTick);
});

test("九维只迁一次，动态项限幅，四项降为性情参数", () => {
  const raw=A.createState("char",T0), drives={drives:{attachment:100,joy:100,stress:100,fatigue:100,intimacy:100,curiosity:80,reflection:70,duty:60,social:50}};
  const first=A.migrateDesireDrive(raw,drives,T0+1);
  assert.equal(first.migrated,true);
  for(const key of ["connection","valence","anxiety","fatigue","warmth"]){
    assert.ok(Math.abs(first.state.emotion.baseline[key]-A.defaultBaseline[key])<=.1500001,key);
  }
  assert.equal(first.state.emotion.temperament.curiosityBias,.8);
  assert.equal(first.state.emotion.temperament.reflectionBias,.7);
  assert.equal(first.state.emotion.temperament.dutyBias,.6);
  assert.equal(first.state.emotion.temperament.socialBias,.5);
  const retry=A.migrateDesireDrive(first.state,{drives:{joy:0}},T0+2);
  assert.equal(retry.migrated,false);
  assert.deepEqual(retry.state.emotion.baseline,first.state.emotion.baseline);
});

test("affinity 与 mood 对 valence 先求和，再共同吃单轴 0.25", () => {
  const mood=A.moodEvidence("温柔安心");
  const capped=A.capDeltas([{name:"affinity",delta:{valence:.25}},{name:"mood",delta:mood.delta}],.25,.55);
  assert.ok(capped.summed.valence>.25);
  assert.equal(capped.axisCapped.valence,.25);
});

test("所有轴合计还要共同吃 Σ|delta|≤0.55", () => {
  const capped=A.capDeltas([{delta:{valence:.25,hurt:.25,anger:.25,anxiety:.25,warmth:.25}}],.25,.55);
  const total=Object.values(capped.applied).reduce((n,v)=>n+Math.abs(v),0);
  assert.ok(Math.abs(total-.55)<1e-12);
  assert.equal(capped.scaledTotal,true);
});

test("固定词典能区分受伤/愤怒/焦虑/柔软/疲惫，未知词不脑补", () => {
  const cases=[["委屈","hurt"],["火大","anger"],["忐忑","anxiety"],["心软","warmth"],["精疲力尽","fatigue"]];
  for(const [word,rule] of cases)assert.ok(A.moodEvidence(word).rules.includes(rule),word);
  const miss=A.moodEvidence("像雨后的玻璃");
  assert.equal(miss.matched,false);assert.deepEqual(miss.delta,{});
});

test("v3 固定词典覆盖真实未命中词，仍不调用模型解释", () => {
  assert.equal(A.moodDictionaryVersion,3);
  const cases=[["松快","positive_valence"],["郁闷","low_valence"],["動揺","anxiety"],["激动","high_arousal"],["冷酷","cold"]];
  for(const [word,rule] of cases)assert.ok(A.moodEvidence(word).rules.includes(rule),word);
  const added=[["平静","calm"],["专注","calm"],["得意","positive_valence"],["调皮","playful"],["害羞","shy"],["落寞","hurt"],["心疼","warmth"],["慵懒","fatigue"]];
  for(const [word,rule] of added)assert.ok(A.moodEvidence(word).rules.includes(rule),word);
  assert.deepEqual(A.moodEvidence("平静").delta,{},"中性词只算识别，不硬改数字");
  const event=A.applyEvent(A.createState("char",T0),{moodLabel:"松快"},T0+1);
  assert.equal(event.audit.moodDictionaryVersion,3);
  assert.equal(event.audit.moodLabel,"松快");
});

test("事件推进不修改 baseline，且靠近边界时边际递减", () => {
  const state=A.createState("char",T0), baseline=structuredClone(state.emotion.baseline);
  state.emotion.current.anger=.95;
  const result=A.applyEvent(state,{delta:{anger:.25}},T0+1);
  assert.deepEqual(result.state.emotion.baseline,baseline);
  assert.ok(result.state.emotion.current.anger<1);
  assert.ok(result.state.emotion.current.anger-state.emotion.current.anger<.25);
});

test("回归只朝 baseline 走且绝不越过，baseline 七天不漂", () => {
  const state=A.createState("char",T0), original=structuredClone(state.emotion.baseline);
  state.emotion.current.hurt=.8;state.emotion.current.warmth=0;
  const next=A.regress(state,7*24*60,T0+7*86400000);
  assert.ok(next.emotion.current.hurt>original.hurt&&next.emotion.current.hurt<.8);
  assert.equal(next.emotion.current.warmth,original.warmth);
  assert.deepEqual(next.emotion.baseline,original);
  assert.equal(next.updatedTs,T0+7*86400000);
});

test("坏事件和坏时间不抛错、不破坏原状态", () => {
  const state=A.createState("char",T0);
  assert.doesNotThrow(()=>A.applyEvent(state,null,T0));
  assert.doesNotThrow(()=>A.regress(state,"坏时间",T0));
  assert.equal(A.applyEvent(null,{delta:{anger:1}},T0).state,null);
});

test("性情锚点去重并只由固定词典生成受控数字", () => {
  const t=A.temperamentFromAnchors([" 敏感 ","敏感","嘴硬","温柔"],true);
  assert.deepEqual(t.anchors,["敏感","嘴硬","温柔"]);
  assert.equal(t.approved,true);
  assert.ok(t.sensitivity.hurt>1&&t.sensitivity.hurt<=1.35);
  assert.ok(t.sensitivity.pride>1&&t.sensitivity.warmth>1);
  assert.deepEqual(t.unmatched,[]);
});

test("未知性情词保留为身份锚点但没有数值权限", () => {
  const t=A.temperamentFromAnchors(["像雨后的玻璃"],false);
  assert.deepEqual(t.anchors,["像雨后的玻璃"]);
  assert.deepEqual(t.sensitivity,{});
  assert.deepEqual(t.unmatched,["像雨后的玻璃"]);
  assert.equal(t.approved,false);
});

test("性情升敏与降敏确定性合成，不受锚点词序影响", () => {
  const a=A.temperamentFromAnchors(["温柔","急躁"],true),b=A.temperamentFromAnchors(["急躁","温柔"],true);
  assert.deepEqual(a.sensitivity,b.sensitivity);
  assert.equal(a.sensitivity.anger,b.sensitivity.anger);
});

test("display 只选偏离 baseline 最大的至多四维", () => {
  const state=A.createState("char",T0);
  state.emotion.temperament=A.temperamentFromAnchors(["敏感","嘴硬"],true);
  Object.assign(state.emotion.current,{hurt:.8,anger:.7,anxiety:.65,warmth:.8,fatigue:.9,valence:.1});
  const out=A.displayProjection(state);
  assert.equal(out.items.length,4);
  assert.ok(out.items.some(x=>x.key==="fatigue"));
  assert.ok(out.text.includes("底色：敏感、嘴硬"));
  assert.ok(out.tokenEstimate>0);
});

test("接近 baseline 时 display 零增量，不硬塞十维", () => {
  const state=A.createState("char",T0),out=A.displayProjection(state);
  assert.deepEqual(out.items,[]);
  assert.equal(out.text,"");
  assert.equal(out.tokenEstimate,0);
});
