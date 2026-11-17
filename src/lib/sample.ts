import type { Requirement } from '../types';

/**
 * 内置示例：用于「离线演示模式」。
 * 未开通模型接口、现场断网或录制演示视频时，也能完整展示核查链路与四类结论。
 * 示例刻意设计为：结构缺项 / 技术达标 / 成果物达标 / 篇幅矛盾 / 附图缺失，
 * 一次覆盖 covered、partial、missing、conflict 四种状态。
 */
export const SAMPLE_TASK_TEXT = `《Web 前端开发》课程实训任务书

一、实训目的
综合运用前端框架完成一个完整 Web 应用，并完成规范的实践报告。

二、报告结构要求
实践报告须包含"需求分析、系统设计、功能实现、测试、总结"五个章节，章节标题不得缺项。

三、技术要求
使用 Vue 3 或 React 实现不少于 3 个功能页面，并实现组件化拆分与路由管理。

四、成果物要求
提交可运行的源码仓库链接，仓库根目录须提供 README.md，说明安装运行方式与目录结构。

五、篇幅要求
实践报告正文不少于 3000 字。

六、附图要求
需附不少于 3 张系统运行截图，并在正文中对每张截图进行说明。

七、提交时间
2026 年 11 月 18 日前提交电子版材料。`;

export const SAMPLE_REPORT_TEXT = `Web 前端开发课程实践报告

一、需求分析
本次实训围绕"校园二手书交易平台"完成一个可运行的前端应用。通过问卷与访谈，我们梳理出三类核心用户诉求：卖家希望快速发布书籍信息，买家希望按课程与专业筛选，管理员需要审核违规信息。系统因此确定以发布、检索、消息为主线，并优先保证移动端适配。

二、系统设计
系统采用 Vue 3 + Vite 单页应用架构，使用 Vue Router 管理路由，Pinia 管理全局状态。页面划分为首页、发布页、消息页三个功能页面。数据层先使用 LocalStorage 做本地持久化，后续可平滑替换为后端接口。组件目录按 views / components / stores 分层，便于团队协作与后续维护。

三、功能实现
首页实现书籍列表、关键词搜索与课程分类筛选；发布页完成表单校验、图片预览与本地存储写入；消息页实现会话列表与未读状态标记。三个页面均完成响应式适配，在 375px 宽度下无横向滚动。项目源码已托管至 Gitee 公开仓库，并在根目录提供 README.md，说明安装命令、目录结构与环境变量配置方式。

四、测试
我们设计了 12 条手工测试用例，覆盖发布、搜索、筛选与消息四个场景，其中 11 条通过，1 条图片预览在 Safari 下偶发失败，已记录为待修复问题。全文约 2200 字。`;

export const SAMPLE_REQUIREMENTS: Requirement[] = [
  {
    id: 'Q1',
    title: '报告章节完整性',
    requirement: '实践报告须包含"需求分析、系统设计、功能实现、测试、总结"五个章节，章节标题不得缺项',
    keywords: ['需求分析', '系统设计', '功能实现', '测试', '总结', '章节'],
    category: '结构',
  },
  {
    id: 'Q2',
    title: '技术栈与页面数',
    requirement: '使用 Vue 3 或 React 实现不少于 3 个功能页面，并实现组件化拆分与路由管理',
    keywords: ['Vue 3', 'React', '功能页面', '组件化', '路由'],
    category: '内容',
  },
  {
    id: 'Q3',
    title: '源码仓库与 README',
    requirement: '提交可运行的源码仓库链接，仓库根目录须提供 README.md，说明安装运行方式与目录结构',
    keywords: ['仓库', 'Gitee', 'README', '源码'],
    category: '成果物',
  },
  {
    id: 'Q4',
    title: '报告字数下限',
    requirement: '实践报告正文不少于 3000 字',
    keywords: ['字数', '3000', '篇幅'],
    category: '格式',
  },
  {
    id: 'Q5',
    title: '运行截图与说明',
    requirement: '需附不少于 3 张系统运行截图，并在正文中对每张截图进行说明',
    keywords: ['截图', '运行图', '附图'],
    category: '成果物',
  },
];

/** 模拟模型原始输出，仍会经过 validateResults 的证据链校验，保证演示与真实链路一致 */
export const SAMPLE_RAW_RESULTS: unknown[] = [
  {
    id: 'Q1',
    status: 'partial',
    confidence: 0.93,
    reason: '报告含需求分析、系统设计、功能实现、测试四章，但未出现"总结"章节，结构缺项。',
    evidence: [
      { chunkId: '', quote: '我们设计了 12 条手工测试用例，覆盖发布、搜索、筛选与消息四个场景' },
    ],
    suggestion: '补充"五、总结与展望"章节，概述收获、不足与改进方向。',
  },
  {
    id: 'Q2',
    status: 'covered',
    confidence: 0.96,
    reason: '明确使用 Vue 3 + Vite，并列出首页、发布页、消息页三个功能页面及路由、组件分层。',
    evidence: [
      { chunkId: '', quote: '页面划分为首页、发布页、消息页三个功能页面' },
      { chunkId: '', quote: '系统采用 Vue 3 + Vite 单页应用架构，使用 Vue Router 管理路由' },
    ],
    suggestion: '无需修改',
  },
  {
    id: 'Q3',
    status: 'covered',
    confidence: 0.95,
    reason: '报告写明源码托管在 Gitee 公开仓库，且根目录含 README.md 与安装说明。',
    evidence: [
      { chunkId: '', quote: '项目源码已托管至 Gitee 公开仓库，并在根目录提供 README.md' },
    ],
    suggestion: '无需修改',
  },
  {
    id: 'Q4',
    status: 'conflict',
    confidence: 0.98,
    reason: '任务书要求正文不少于 3000 字，报告自述"全文约 2200 字"，两者直接矛盾。',
    evidence: [{ chunkId: '', quote: '全文约 2200 字' }],
    suggestion: '扩充需求分析与测试分析，使正文达到 3000 字以上，并删除或修改字数自述。',
  },
  {
    id: 'Q5',
    status: 'missing',
    confidence: 0.9,
    reason: '全文未检索到任何关于运行截图或附图说明的内容。',
    evidence: [],
    suggestion: '补充至少 3 张运行截图，并在正文中逐张编号说明。',
  },
];
