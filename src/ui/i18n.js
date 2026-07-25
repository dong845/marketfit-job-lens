export const MESSAGES = {
  en: {
    appTitle: "MarketFit", language: "Language", temporary: "Your PDF resume and captured job stay in this panel unless you explicitly run AI analysis.",
    profile: "Your profile", resumePdf: "CV PDF", noResume: "No resume PDF selected.", uploadHint: "1. Upload a text-based PDF resume. 2. Open a full job posting tab, choose an AI provider, then run AI analysis.", market: "Target market", workAuthorization: "Work authorization", clearSession: "Clear local session",
    authorized: "Already authorized", needsSponsorship: "Needs sponsorship", openWorkPermit: "Open work permit", studentGraduate: "Student or graduate route", temporaryRoute: "Other temporary route", unknown: "Unknown",
    currentJob: "Current job", refreshJob: "Re-read job page", editJob: "Edit job text", close: "Close", jobTitle: "Job title", company: "Company", jobLocation: "Location", jobDescriptionText: "Job description", saveJobText: "Use this JD",
    noData: "Upload a CV PDF, choose an AI provider, then run AI analysis while the full job posting is open.", missingResume: "Upload a CV PDF before analysing a job.", capturing: "Reading the current job page", captureBlocked: "This page cannot be read yet.", noJobContent: "No usable job description was found on this page.", grantSiteAccess: "Allow reading this site", accessDenied: "Site access was not granted. You can allow it and try again.", lowConfidence: "The page was captured, but job details are incomplete. Open the full job posting and try again.", lowQualityJob: "The captured job text is too short or incomplete ({chars} characters). Re-read the page or edit/paste the JD.", jobQualityLine: "{chars} chars · {method} · {confidence}% confidence", capturedJobStats: "Job ready for AI: {chars} characters, {confidence}% confidence.", jobReadyForAi: "Job page is ready. Choose an AI provider and run analysis.",
    pdfReading: "Reading your PDF locally", pdfReady: "{name} ready: {pages} page(s).", pdfTruncated: "{name} is ready; only the first 60,000 characters are used.", pdfFailed: "The PDF could not be used.",
    agentHeading: "AI job analysis", agentExplain: "AI reads the full PDF-derived CV and the current job page, then returns cited role understanding, evidence, gaps, risks, and preparation guidance.",
    bridgeUnpaired: "Local AI Bridge is not paired.", bridgePort: "Bridge port", pairingCode: "One-time pairing code", pairBridge: "Pair bridge", refreshStatus: "Refresh status", disconnect: "Disconnect",
    bridgeSetupTitle: "One-time setup", bridgeSetupIntro: "Run this in a terminal, inside the MarketFit folder. It prints a pairing code — paste it below. No API key, no per-analysis cost.", bridgeSetupNote: "Keep that terminal open while you use MarketFit.", copyCommand: "Copy", copied: "Copied",
    chooseProvider: "Choose a provider", provider: "AI provider", codex: "Codex CLI", claudeCode: "Claude Code", openaiApi: "OpenAI API key", anthropicApi: "Anthropic API key", sessionApiKey: "Session API key", apiModel: "Model",
    openAiGpt5Mini: "GPT-5 mini (faster, lower cost)", openAiGpt5: "GPT-5 (more capable)", anthropicSonnet5: "Claude Sonnet 5 (balanced)", anthropicOpus5: "Claude Opus 5 (most capable)", anthropicSonnet46: "Claude Sonnet 4.6 (lower cost)", anthropicOpus46: "Claude Opus 4.6",
    runAiReview: "Analyze current job with AI", cliBridgeHelp: "Codex CLI and Claude Code use the login you already have on this machine, through a local bridge you start yourself.", apiDirectHelp: "The session key remains only in this open panel. MarketFit asks before directly connecting to this provider, does not use a local Bridge, and never saves the key.", agentPrivacy: "CLI providers send the current PDF-derived CV text and job page through the paired local Bridge. API-key providers connect directly to their selected provider only after you run an analysis. API keys remain only in the open panel and are never saved.",
    privacy: "Privacy and permissions", privacyExplain: "Default PDF parsing and page capture stay local. AI transfer occurs only after you explicitly run it.", previewPayload: "Preview optional AI payload", extensionPermission: "CLI providers use the paired local Bridge. API-key providers request direct access only to their selected API domain when you run an analysis.",
    permActiveTab: "capture the current visible page after a click.", permScripting: "run that one-time visible-page extractor.", permStorage: "save interface language and, for CLI providers only, the paired local Bridge token; PDF files and API keys are never stored.", permSidePanel: "show this workspace.",
    paired: "Paired to 127.0.0.1:{port}. Available: {providers}.", bridgeUnavailable: "No Bridge answering on 127.0.0.1:{port}. Start it with the command above, then paste the pairing code it prints. A running Bridge stays paired across restarts.", bridgePaired: "Local AI Bridge paired.", bridgeOutdated: "The running Bridge is v{running} but this extension is v{expected}. Stop it and run the command above again — a running Bridge keeps using the code it started with.", pairingFailed: "Bridge pairing failed.", bridgeDisconnected: "Local Bridge disconnected. Restart it before pairing again.", providerNotInstalled: "not found on this machine",
    chooseProviderFirst: "Choose an AI provider first.", aiFinished: "AI analysis completed with {provider}.", requestingAi: "Job captured. Requesting AI analysis", apiKeyNeeded: "Enter a session API key for the selected provider.", directAccessDenied: "Direct access to the selected AI provider was not allowed.", retryAccess: "Allow provider access", aiSupplement: "AI-generated analysis, drawn only from your CV and this job page. Verify anything material before acting.",
    jobUnderstanding: "What this role is", candidatePositioning: "Where you stand", fitNarrative: "How you line up", evidenceRequirements: "Requirements", aiStrengths: "Where you are strongest", aiGaps: "Gaps to close", aiRisks: "Risks to verify", resumeTailoring: "Tailor your CV", interviewFocus: "Prepare for interview", employerQuestions: "Ask the employer", suggestedActions: "Do this next",
    openReport: "Open full report", reportPrint: "Print or save as PDF", reportModel: "Analysed by", reportGenerated: "Generated", reportSource: "Source", reportFailed: "The report could not be opened.", reportNothingToShow: "Run an analysis first — there is nothing to report yet.", reportUnreadable: "This report could not be read from browser storage.", reportOpened: "Report opened in a new tab.", reportOpenManually: "Copy this address into a new tab to open the report:", reportExpired: "This report has expired. Reports are kept for the current browser session only — run the analysis again to make a new one.", analysisFailed: "The analysis could not be completed.", analysisEmpty: "The provider replied, but returned no usable analysis. Try again, or switch model.", analysing: "Analysing with {model} — {seconds}s elapsed, usually about {estimate}s", analysingOvertime: "Analysing with {model} — {seconds}s elapsed, longer than usual",
    verdictStrongFit: "Strong fit", verdictWorthApplying: "Worth applying", verdictStretch: "A stretch", verdictWeakFit: "Weak fit", howToClose: "How to close it:",
    sectionPrepare: "Prepare", sectionVerify: "Check before applying", noRequirements: "The model returned no specific requirements for this posting.",
    matchStrong: "Strong", matchPartial: "Partial", matchGap: "Gap", matchNoEvidence: "No evidence",
    levelRequired: "Required", levelPreferred: "Preferred", levelUnclear: "Unclear",
    priorityNow: "Now", priorityBeforeApply: "Before applying", priorityLater: "Later",
    severityMaterial: "Material", severityModerate: "Moderate", severityUnknown: "Unclear"
  },
  zh: {
    appTitle: "MarketFit", language: "界面语言", temporary: "PDF 简历和当前职位默认只保留在此侧栏中；仅在你主动运行 AI 分析时才会进行额外传输。",
    profile: "你的资料", resumePdf: "PDF 简历", noResume: "尚未选择 PDF 简历。", uploadHint: "1. 上传可提取文字的 PDF 简历。2. 打开完整职位详情页、选择 AI 提供商后，运行 AI 分析。", market: "目标市场", workAuthorization: "工作授权", clearSession: "清除本地会话",
    authorized: "已具备工作授权", needsSponsorship: "需要雇主担保", openWorkPermit: "开放工作许可", studentGraduate: "学生或毕业生路径", temporaryRoute: "其他临时路径", unknown: "未知",
    currentJob: "当前职位", refreshJob: "重新读取职位页", editJob: "编辑职位文本", close: "关闭", jobTitle: "职位名称", company: "公司", jobLocation: "地点", jobDescriptionText: "职位描述", saveJobText: "使用这份 JD",
    noData: "上传 PDF 简历、选择 AI 提供商后，在打开完整职位详情页时运行 AI 分析。", missingResume: "请先上传 PDF 简历，再分析职位。", capturing: "正在读取当前职位页面", captureBlocked: "暂时无法读取此页面。", noJobContent: "未在此页面找到可用的职位描述。", grantSiteAccess: "允许读取此网站", accessDenied: "未获得网站读取权限。允许后可再次尝试。", lowConfidence: "职位页面已抓取，但关键信息不完整。请打开完整职位详情后重试。", lowQualityJob: "读取到的职位文本过短或不完整（{chars} 个字符）。请重新读取页面，或编辑/粘贴 JD。", jobQualityLine: "{chars} 字符 · {method} · {confidence}% 置信度", capturedJobStats: "职位已可用于 AI：{chars} 个字符，{confidence}% 置信度。", jobReadyForAi: "职位页面已就绪。请选择 AI 提供商并运行分析。",
    pdfReading: "正在本地读取 PDF", pdfReady: "{name} 已就绪：{pages} 页。", pdfTruncated: "{name} 已就绪；仅使用前 60,000 个字符。", pdfFailed: "无法使用该 PDF。",
    agentHeading: "AI 职位分析", agentExplain: "AI 会阅读完整的 PDF 简历文本和当前职位页面，给出带原文引证的岗位理解、匹配证据、缺口、风险和准备建议。",
    bridgeUnpaired: "本地 AI Bridge 尚未配对。", bridgePort: "Bridge 端口", pairingCode: "一次性配对码", pairBridge: "配对 Bridge", refreshStatus: "刷新状态", disconnect: "断开连接",
    bridgeSetupTitle: "一次性设置", bridgeSetupIntro: "在终端中进入 MarketFit 目录并运行以下命令。它会打印一个配对码，粘贴到下方即可。无需 API Key，也不按次计费。", bridgeSetupNote: "使用 MarketFit 期间请保持该终端窗口开启。", copyCommand: "复制", copied: "已复制",
    chooseProvider: "选择提供商", provider: "AI 提供商", codex: "Codex CLI", claudeCode: "Claude Code", openaiApi: "OpenAI API Key", anthropicApi: "Anthropic API Key", sessionApiKey: "会话 API Key", apiModel: "模型",
    openAiGpt5Mini: "GPT-5 mini（更快、成本更低）", openAiGpt5: "GPT-5（能力更强）", anthropicSonnet5: "Claude Sonnet 5（均衡）", anthropicOpus5: "Claude Opus 5（能力最强）", anthropicSonnet46: "Claude Sonnet 4.6（成本更低）", anthropicOpus46: "Claude Opus 4.6",
    runAiReview: "用 AI 分析当前职位", cliBridgeHelp: "Codex CLI 和 Claude Code 会复用本机已有的登录态，通过你自己启动的本地 Bridge 工作。", apiDirectHelp: "会话 API Key 只保留在当前打开的侧栏中。MarketFit 会在直连该提供商前请求权限，不使用本地 Bridge，也不会保存 Key。", agentPrivacy: "Codex CLI 和 Claude Code 会通过已配对的本地 Bridge 发送当前 PDF 简历文字和职位页面。选择 API Key 后，仅在你运行分析时才会直连对应提供商。API Key 只保留在当前打开的侧栏中，不会被保存。",
    privacy: "隐私与权限", privacyExplain: "默认的 PDF 解析和页面抓取都在本地完成。仅在你主动运行 AI 分析时才会发生数据传输。", previewPayload: "预览可选 AI 负载", extensionPermission: "Codex CLI 和 Claude Code 使用已配对的本地 Bridge；API Key 提供商仅在你运行分析时请求直连所选 API 域名。",
    permActiveTab: "在你点击后抓取当前可见页面。", permScripting: "运行那一次性的可见页面提取脚本。", permStorage: "保存界面语言；仅在使用 CLI 提供商时保存本地 Bridge 令牌。PDF 文件和 API Key 从不保存。", permSidePanel: "显示此侧栏工作区。",
    paired: "已配对至 127.0.0.1:{port}。可用：{providers}。", bridgeUnavailable: "127.0.0.1:{port} 上没有 Bridge 响应。请用上方命令启动它，然后粘贴它打印的配对码。启动后的 Bridge 会在重启之间保持配对。", bridgePaired: "本地 AI Bridge 已配对。", bridgeOutdated: "正在运行的 Bridge 是 v{running}，而扩展是 v{expected}。请停掉它并重新运行上方命令 —— 运行中的 Bridge 会一直使用启动时加载的代码。", pairingFailed: "Bridge 配对失败。", bridgeDisconnected: "本地 Bridge 已断开。再次配对前请重启它。", providerNotInstalled: "本机未安装",
    chooseProviderFirst: "请先选择 AI 提供商。", aiFinished: "已使用 {provider} 完成 AI 分析。", requestingAi: "职位已读取，正在请求 AI 分析", apiKeyNeeded: "请为选定提供商填写会话 API Key。", directAccessDenied: "未允许直连所选 AI 提供商。", retryAccess: "允许访问该提供商", aiSupplement: "由 AI 生成，仅依据你的简历与本职位页面。执行重要决定前请自行核实。",
    jobUnderstanding: "这个岗位在做什么", candidatePositioning: "你的位置", fitNarrative: "匹配情况", evidenceRequirements: "岗位要求", aiStrengths: "你最强的部分", aiGaps: "需要补齐的缺口", aiRisks: "需要核实的风险", resumeTailoring: "简历优化方向", interviewFocus: "面试准备重点", employerQuestions: "可以问雇主的问题", suggestedActions: "接下来做什么",
    openReport: "打开完整报告", reportPrint: "打印或另存为 PDF", reportModel: "分析模型", reportGenerated: "生成时间", reportSource: "来源", reportFailed: "无法打开报告。", reportNothingToShow: "请先运行一次分析，目前还没有可生成的报告。", reportUnreadable: "无法从浏览器存储中读取该报告。", reportOpened: "报告已在新标签页中打开。", reportOpenManually: "把下面的地址复制到新标签页即可打开报告：", reportExpired: "该报告已失效。报告仅在当前浏览器会话内保留，请重新运行分析以生成新的报告。", analysisFailed: "分析未能完成。", analysisEmpty: "提供商已返回，但没有给出可用的分析结果。请重试或更换模型。", analysing: "正在使用 {model} 分析 — 已用 {seconds} 秒，通常约 {estimate} 秒", analysingOvertime: "正在使用 {model} 分析 — 已用 {seconds} 秒，比平常久一些",
    verdictStrongFit: "高度匹配", verdictWorthApplying: "值得投递", verdictStretch: "有挑战", verdictWeakFit: "匹配度低", howToClose: "如何补足：",
    sectionPrepare: "准备", sectionVerify: "投递前核实", noRequirements: "模型未从该职位页面中提取到具体要求。",
    matchStrong: "充分", matchPartial: "部分", matchGap: "缺口", matchNoEvidence: "无证据",
    levelRequired: "必需", levelPreferred: "加分", levelUnclear: "不明确",
    priorityNow: "现在", priorityBeforeApply: "投递前", priorityLater: "之后",
    severityMaterial: "重要", severityModerate: "中等", severityUnknown: "不明确"
  }
};

export function t(locale, key) {
  return MESSAGES[locale]?.[key] || MESSAGES.en[key] || key;
}

export function format(locale, key, values = {}) {
  return t(locale, key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""));
}

export function applyTranslations(root, locale) {
  root.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t(locale, element.dataset.i18n); });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(locale, element.dataset.i18nPlaceholder); });
  // Icon-only controls carry their label in title/aria-label rather than in text.
  // Previously these attributes existed in the markup but nothing read them, so
  // every icon button kept its English tooltip after switching to Chinese.
  root.querySelectorAll("[data-i18n-title]").forEach((element) => {
    const label = t(locale, element.dataset.i18nTitle);
    element.title = label;
    element.setAttribute("aria-label", label);
  });
}
