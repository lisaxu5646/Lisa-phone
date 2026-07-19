"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");

function loadWindowModule(path,key){
  const old=global.window;global.window={};delete require.cache[require.resolve(path)];require(path);const mod=global.window[key];global.window=old;return mod;
}

test("人格同一证据跨 probe 不重复计数，十天按两次对不上之间计算",()=>{
  const P=loadWindowModule("../js/personality-shadow.js","PersonalityShadow"),day=86400000,base=Date.UTC(2026,0,1);
  const card={type:"对不上",dimension:"边界",traitKey:"会拒绝",target:null,note:"一次",evidence:[{messageId:"m1",quote:"不",role:"角色"}]};
  const first=P._mergeObservation(null,card,"c","f",base),dup=P._mergeObservation(first,card,"c","f",base+11*day);
  assert.equal(dup.typeCounts["对不上"],1);assert.equal(dup.seenCount,1);assert.equal(dup.eligibleAfterTenDays,false);
  const second=P._mergeObservation(dup,{...card,evidence:[{messageId:"m2",quote:"不了",role:"角色"}]},"c","f",base+12*day);
  assert.equal(second.typeCounts["对不上"],2);assert.equal(second.mismatchSpanDays,12);assert.equal(second.eligibleAfterTenDays,true);
});

test("正常原位编辑保留后文不再被消息分支仪表判异常",()=>{
  const M=loadWindowModule("../js/message-branch-shadow.js","MessageBranchShadow"),a={id:"a"},b={id:"b"};
  const out=M.inspectMutation({kind:"edit",targetIndex:0,before:[a,b],after:[{id:"a",content:"改"},b]});
  assert.equal(out.valid,true);assert.equal(out.tailSurvived,false);
});

test("Experience Gate 区分标题标签与正文冒充亲历",()=>{
  const E=loadWindowModule("../js/experience-gate-shadow.js","ExperienceGateShadow");
  const header=E.classify("【此刻在做什么】\n日程模拟结果"),body=E.classify("【今天的行程】\n你都看到了，这是真实发生的");
  assert.equal(header.truthClaimRisk,true);assert.equal(header.riskReason,"header_label_only");
  assert.equal(body.truthClaimRisk,true);assert.equal(body.riskReason,"assertive_body");
});
