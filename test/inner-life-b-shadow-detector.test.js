"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {JiwenEmotionA:Core}=require("../js/jiwen.js");
const B=require("../js/inner-life-b-shadow.js");

const msgs=[
  {role:"user",mid:"u1",content:"我刚才只是开玩笑啦"},
  {role:"assistant",mid:"a1",content:"我知道，你逗我呢"},
  {role:"user",mid:"u2",content:"我会认真听完你的边界，不再继续推你"}
];

test("试点只认阿屿和顾暮，小克与近似名字都不接",()=>{
  assert.deepEqual(B.pilotFor({id:"1",name:"阿屿"}).enabledAxes,["continuity","neglect","boundary","seriousness"]);
  assert.deepEqual(B.pilotFor({id:"2",name:"顾暮"}).enabledAxes,["identity","continuity","boundary","neglect"]);
  assert.equal(B.pilotFor({id:"3",name:"小克"}),null);
  assert.equal(B.pilotFor({id:"4",name:"阿屿老师"}),null);
});

test("检测请求只带最近真实消息、试点轴和已批准性情",()=>{
  const char={id:"1",name:"阿屿"},pilot=B.pilotFor(char),state=Core.createState("h",1);
  state.emotion.temperament=Core.temperamentFromAnchors(["黏人","敏感"],true);
  const spec=B.detectorSpec(char,pilot,state,msgs.concat({role:"system",content:"内部提示"}));
  const payload=JSON.parse(spec.messages[0].content);
  assert.equal(spec.maxTokens,6000);
  assert.deepEqual(payload.enabledAxes,pilot.enabledAxes);
  assert.deepEqual(payload.role.temperament,["黏人","敏感"]);
  assert.equal(payload.messages.some(x=>x.text.includes("内部提示")),false);
});

test("detector 输出必须逐字证据有效，坏 quote 和未启用轴被丢弃",()=>{
  const raw={events:[
    {axis:"boundary",kind:"repair_progress",confidence:.9,explicitRelationMeaning:true,playfulContext:false,repairKind:"behavior_changed",evidenceMessageIds:["u2"],evidenceQuotes:["认真听完你的边界"]},
    {axis:"boundary",kind:"harm",confidence:.9,explicitRelationMeaning:true,playfulContext:false,repairKind:null,evidenceMessageIds:["u1"],evidenceQuotes:["原文没有这句"]},
    {axis:"identity",kind:"harm",confidence:.9,explicitRelationMeaning:true,playfulContext:false,repairKind:null,evidenceMessageIds:["u1"],evidenceQuotes:["只是开玩笑"]}
  ]};
  const out=B.validateEvents(raw,["boundary"],msgs);
  assert.equal(out.length,1);assert.equal(out[0].axis,"boundary");assert.deepEqual(out[0].evidenceMessageIds,["u2"]);
});

test("observe 串行写进同一 A 状态行，但不改十维情绪",async()=>{
  let row=null,calls=0;
  globalThis.JiwenEmotionA=Core;
  globalThis.InnerLifeAShadow={hash:x=>"h_"+x,get:async()=>row,put:async(_o,_c,next)=>(row=structuredClone(next))};
  const char={id:"ayu",name:"阿屿"},before=Core.createState("h_ayu",1).emotion.current;
  const result=await B.observe({ownerId:"owner",char,messages:msgs,runDetector:async()=>{calls++;return {events:[{axis:"boundary",kind:"harm",confidence:1,explicitRelationMeaning:true,playfulContext:false,repairKind:null,evidenceMessageIds:["u2"],evidenceQuotes:["不再继续推你"]}]};}});
  assert.equal(calls,1);assert.equal(result.saved,true);assert.ok(row.relationAxes);assert.deepEqual(row.emotion.current,before);
});

test("非试点完全不调用 detector",async()=>{
  let calls=0;
  const out=await B.observe({ownerId:"owner",char:{id:"ke",name:"小克"},messages:msgs,runDetector:async()=>{calls++;return {};}});
  assert.equal(out.skipped,true);assert.equal(calls,0);
});
