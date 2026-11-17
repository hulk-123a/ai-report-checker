/**
 * 端到端真实核查验证（直接打服务端 /api/llm，不经过浏览器）。
 * 验证三件事：
 *   1. 阶段一：任务书拆解为要求项；
 *   2. 阶段二：模型通过 Function Calling 返回 retrieve_evidence 工具调用；
 *   3. 阶段三：把工具结果回灌后，模型输出可解析的逐条判定 JSON。
 * 运行：node scripts/e2e-verify.mjs
 */
const BASE = 'http://localhost:4173/api/llm';

async function post(body) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${res.status} ${data.error ?? ''} ${data.detail ?? ''}`);
  return data;
}

const SYSTEM = `你是核查镜·材料一致性核查Agent。只依据提供的材料下结论，不编造。只输出JSON。`;

const TASK = `课程实训任务书要求：
1. 项目采用React与TypeScript技术栈，使用Vite构建。
2. 实现不少于5个功能页面。
3. 提交源码仓库链接与README文档。
4. 实践报告字数不少于2000字。
5. 完成不少于15个功能测试用例。`;

const REPORT = `一、系统设计
本项目采用React 18与TypeScript严格模式开发，Vite 5作为构建工具。
二、功能实现
共实现6个页面：首页、列表、详情、发布、消息、个人中心。
三、测试
设计20个用例，18个通过，2个因超时未通过。
四、总结
源码已提交至GitHub公开仓库并附README，报告约3000字。`;

async function main() {
  console.log('[1/4] 阶段一：拆解任务书要求…');
  const step1 = await post({
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `把任务书拆解为最多8条可核查要求，输出JSON数组，每条含 id/title/requirement/keywords 字段。只输出JSON数组。\n${TASK}`,
      },
    ],
    max_tokens: 1500,
  });
  const reqRaw = step1.choices?.[0]?.message?.content ?? '';
  console.log('  要求项原文:', reqRaw.slice(0, 180).replace(/\n/g, ' '));
  let requirements;
  try {
    const m = reqRaw.match(/\[[\s\S]*\]/);
    requirements = JSON.parse(m ? m[0] : reqRaw);
  } catch (e) {
    throw new Error('阶段一输出无法解析: ' + e.message);
  }
  console.log(`  ✓ 拆解出 ${requirements.length} 条要求`);

  console.log('[2/4] 阶段二：模型 Function Calling 工具调用…');
  const tools = [
    {
      type: 'function',
      function: {
        name: 'retrieve_evidence',
        description: '在报告中检索与某条要求相关的原文片段',
        parameters: {
          type: 'object',
          properties: {
            requirement_id: { type: 'string' },
            intent: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
          },
          required: ['intent', 'keywords'],
        },
      },
    },
  ];
  const step2 = await post({
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `请为每条要求各调用一次 retrieve_evidence 工具检索报告证据。\n要求项：${JSON.stringify(requirements)}`,
      },
    ],
    tools,
    tool_choice: 'required',
    max_tokens: 2000,
  });
  const toolCalls = step2.choices?.[0]?.message?.tool_calls ?? [];
  console.log(`  ✓ 模型发起 ${toolCalls.length} 次工具调用`);
  if (toolCalls.length === 0) throw new Error('模型未返回任何工具调用，Function Calling 验证失败');
  console.log('  示例调用:', toolCalls[0].function.name, toolCalls[0].function.arguments.slice(0, 120));

  console.log('[3/4] 回灌工具结果并请求逐条判定…');
  // 用报告全文作为每次工具结果（真实应用由本地BM25执行）
  const toolMessages = toolCalls.map((call) => ({
    role: 'tool',
    tool_call_id: call.id,
    content: `检索结果：${REPORT}`,
  }));
  const step3 = await post({
    messages: [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: `请为每条要求各调用一次 retrieve_evidence 工具检索报告证据。\n要求项：${JSON.stringify(requirements)}`,
      },
      // OpenAI 协议要求：tool 消息必须紧随含 tool_calls 的 assistant 消息
      { role: 'assistant', content: '', tool_calls: toolCalls },
      ...toolMessages,
      {
        role: 'user',
        content: `根据工具检索到的证据，逐条判定要求是否被报告满足。status四选一covered/partial/missing/conflict，evidence.quote必须是报告原文。输出JSON数组。\n要求项：${JSON.stringify(requirements)}`,
      },
    ],
    max_tokens: 2500,
  });
  const judgeRaw = step3.choices?.[0]?.message?.content ?? '';
  let results;
  try {
    const m = judgeRaw.match(/\[[\s\S]*\]/);
    results = JSON.parse(m ? m[0] : judgeRaw);
  } catch (e) {
    throw new Error('阶段三输出无法解析: ' + e.message + '\n原文:' + judgeRaw.slice(0, 300));
  }
  console.log(`  ✓ 判定 ${results.length} 条:`, results.map((r) => r.status).join('/'));

  console.log('[4/4] 验证证据可追溯…');
  let traceable = 0;
  for (const r of results) {
    const evs = Array.isArray(r.evidence) ? r.evidence : r.evidence ? [r.evidence] : [];
    for (const ev of evs) {
      const quote = typeof ev === 'object' && ev !== null ? String((ev).quote ?? '') : String(ev);
      if (quote && REPORT.replace(/\s/g, '').includes(quote.replace(/\s/g, '').slice(0, 10))) traceable += 1;
    }
  }
  console.log(`  ✓ ${traceable} 条引用可在报告原文中追溯`);

  console.log('\n✅ 端到端 Function Calling 全链路验证通过');
}

main().catch((e) => {
  console.error('❌ 验证失败:', e.message);
  process.exit(1);
});
