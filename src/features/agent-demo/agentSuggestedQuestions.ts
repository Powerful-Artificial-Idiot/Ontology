import type { AgentSuggestedQuestion } from "./agentDemoTypes";

export const agentSuggestedQuestionsByScenario: Record<string, AgentSuggestedQuestion[]> = {
  "quality-issue-trace": [
    {
      zh: "OP30 的 Leak Rate 容许范围是多少？",
      en: "What is the allowable Leak Rate range at OP30?",
    },
    {
      zh: "OP30 的 Leak Rate 提升 50% 是否超标？",
      en: "Would a 50% increase in OP30 Leak Rate exceed the governed limits?",
    },
    {
      zh: "OP30 当前 Leak Rate 水平、最大值和 Cpk 是多少？",
      en: "What are the current OP30 Leak Rate mean, maximum and Cpk?",
    },
    {
      zh: "超过 0.27 sccm 后需要执行哪些措施？ OP30 Leak Rate",
      en: "Which governed actions are required after OP30 Leak Rate exceeds 0.27 sccm?",
    },
    {
      zh: "M220 程序 v3.5 是否已经可以用于正式生产？ OP30 Leak Rate",
      en: "Is M220 program V3.5 approved and effective for production at OP30?",
    },
    {
      zh: "OP20 是瓶颈，是否证明它导致了 OP30 Leak Rate 上升？",
      en: "Does the OP20 bottleneck prove that it caused the OP30 Leak Rate increase?",
    },
    {
      zh: "OP30 的 Leak Rate 最近异常，可能影响哪些产品、设备、质量风险、工程文件和价值流指标？",
      en: "Which products, equipment, quality risks, engineering documents, and value-stream metrics could be affected by the recent Leak Rate abnormality at OP30?",
    },
    {
      zh: "如果问题来自 M220 的测试程序版本变更，它会通过哪些知识关系影响 Leak Rate 和后续质量判断？",
      en: "If the issue comes from an M220 test-program version change, which knowledge relationships connect it to Leak Rate and subsequent quality decisions?",
    },
    {
      zh: "基于前两轮分析，下一步我应该优先安排哪些验证动作？",
      en: "Based on the first two rounds of analysis, which validation actions should I prioritize next?",
    },
    {
      zh: "如果 Leak Rate 异常持续扩大，是否可能形成临时质量瓶颈？",
      en: "Could a continuing increase in Leak Rate abnormalities create a temporary quality bottleneck?",
    },
  ],
  "engineering-change-impact": [
    {
      zh: "如果 M220 Leak Test Bench 的测试程序从 V3.4 升级到 V3.5，会影响哪些工序、质量特性、文件和放行条件？",
      en: "If the M220 Leak Test Bench program is upgraded from V3.4 to V3.5, which operations, quality characteristics, documents, and release conditions are affected?",
    },
    {
      zh: "这个工程变更需要哪些质量文件和验证记录支撑？",
      en: "Which quality documents and validation records are required to support this engineering change?",
    },
    {
      zh: "如果验证失败，应该如何评估对生产和价值流的影响？",
      en: "If validation fails, how should the impact on production and the value stream be assessed?",
    },
    {
      zh: "哪些对象需要在 Route Explorer、Ontology Explorer 和 Semantic Explorer 中同步更新？",
      en: "Which objects must be updated consistently in Route Explorer, Ontology Explorer, and Semantic Explorer?",
    },
  ],
  "bottleneck-analysis": [
    {
      zh: "为什么 OP20 可能是当前路线的瓶颈？请同时从 Production 和 Value Stream 两个视角解释。",
      en: "Why might OP20 be the current route bottleneck? Explain it from both Production and Value Stream perspectives.",
    },
    {
      zh: "如果 OP30 的 Leak Rate 异常导致返工复测增加，瓶颈会不会从 OP20 转移到 OP30？",
      en: "If an OP30 Leak Rate abnormality increases rework and retesting, could the bottleneck shift from OP20 to OP30?",
    },
    {
      zh: "我应该优先收集哪些数据来确认真实瓶颈？",
      en: "Which data should I collect first to confirm the actual bottleneck?",
    },
    {
      zh: "如果瓶颈确认在 OP20，应该从哪些改善方向入手？",
      en: "If OP20 is confirmed as the bottleneck, which improvement directions should be addressed first?",
    },
  ],
};

export function getSuggestedQuestionAliases(scenarioId: string, canonicalQuestion: string) {
  const option = agentSuggestedQuestionsByScenario[scenarioId]?.find((question) => question.zh === canonicalQuestion);
  return option ? [option.zh, option.en] : [canonicalQuestion];
}
