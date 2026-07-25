export const MESSAGES = {
  en: {
    appTitle: "MarketFit", language: "Language", temporary: "Your PDF resume and captured job stay in this panel unless you explicitly run AI analysis.",
    profile: "Your profile", resumePdf: "CV PDF", noResume: "No resume PDF selected.", uploadHint: "1. Upload a text-based PDF resume. 2. Open a full job posting tab, choose an AI provider, then run AI analysis.", market: "Target market", workAuthorization: "Work authorization", clearSession: "Clear local session",
    authorized: "Already authorized", needsSponsorship: "Needs sponsorship", openWorkPermit: "Open work permit", studentGraduate: "Student or graduate route", temporaryRoute: "Other temporary route", unknown: "Unknown",
    currentJob: "Current job", refreshJob: "Re-read job page", editJob: "Edit job text", close: "Close", jobTitle: "Job title", company: "Company", jobLocation: "Location", jobDescriptionText: "Job description", saveJobText: "Use this JD",
    noData: "Upload a CV PDF, choose an AI provider, then run AI analysis while the full job posting is open.", missingResume: "Upload a CV PDF before analysing a job.", capturing: "Reading the current job page", captureBlocked: "This page cannot be read yet.", noJobContent: "No usable job description was found on this page.", grantSiteAccess: "Allow reading this site", accessDenied: "Site access was not granted. You can allow it and try again.", lowConfidence: "The page was captured, but job details are incomplete. Open the full job posting and try again.", lowQualityJob: "The captured job text is too short or incomplete ({chars} characters). Re-read the page or edit/paste the JD.", jobQualityLine: "{chars} chars · {method} · {confidence}% confidence", capturedJobStats: "Job ready for AI: {chars} characters, {confidence}% confidence.", jobReadyForAi: "Job page is ready. Choose an AI provider and run analysis.",
    pdfReading: "Reading your PDF locally", pdfReady: "{name} ready: {pages} page(s).", pdfTruncated: "{name} is ready; only the first 60,000 characters are used.", pdfFailed: "The PDF could not be used.",
    agentHeading: "AI job analysis", agentExplain: "AI reads your full PDF CV and the current job page, then tells you whether to apply, what each requirement looks like against your CV, what is missing, and how to prepare.",
    chooseProvider: "Choose a provider", provider: "AI provider", openaiApi: "OpenAI", anthropicApi: "Anthropic", deepseekApi: "DeepSeek", sessionApiKey: "Session API key", apiModel: "Model",
    openAiGpt5Mini: "GPT-5 mini (faster, lower cost)", openAiGpt5: "GPT-5 (more capable)", anthropicSonnet5: "Claude Sonnet 5 (balanced)", anthropicOpus5: "Claude Opus 5 (most capable)", anthropicSonnet46: "Claude Sonnet 4.6 (lower cost)", anthropicOpus46: "Claude Opus 4.6", deepseekChat: "DeepSeek V3 (faster, lower cost)", deepseekReasoner: "DeepSeek R1 (reasoning)",
    runAiReview: "Analyze current job with AI", apiDirectHelp: "The session key remains only in this open panel. MarketFit asks before directly connecting to this provider, does not use a local Bridge, and never saves the key.", agentPrivacy: "Running an analysis sends the PDF-derived CV text and the captured job page directly to the provider you chose, and to no one else. Your API key stays in this open panel and is never saved.",
    privacy: "Privacy and permissions", privacyExplain: "Default PDF parsing and page capture stay local. AI transfer occurs only after you explicitly run it.", previewPayload: "Preview optional AI payload", extensionPermission: "Access to a provider\u2019s API domain is requested only when you select it.",
    permActiveTab: "capture the current visible page after a click.", permScripting: "run that one-time visible-page extractor.", permStorage: "save interface language and how long past analyses took; PDF files and API keys are never stored.", permSidePanel: "show this workspace.",
    chooseProviderFirst: "Choose an AI provider first.", aiFinished: "AI analysis completed with {provider}.", requestingAi: "Job captured. Requesting AI analysis", apiKeyNeeded: "Enter a session API key for the selected provider.", directAccessDenied: "Direct access to the selected AI provider was not allowed.", retryAccess: "Allow provider access", aiSupplement: "AI-generated analysis, drawn only from your CV and this job page. Verify anything material before acting.",
    jobUnderstanding: "What this role is", candidatePositioning: "Where you stand", fitNarrative: "How you line up", evidenceRequirements: "Requirements", aiStrengths: "Where you are strongest", aiGaps: "Gaps to close", aiRisks: "Risks to verify", resumeTailoring: "Tailor your CV", interviewFocus: "Prepare for interview", employerQuestions: "Ask the employer", suggestedActions: "Do this next", actionStepsHint: "In order. Everything the analysis asks of you is on this list.",
    openReport: "Open full report", reportPrint: "Print or save as PDF", reportModel: "Analysed by", reportGenerated: "Generated", reportSource: "Source", reportFailed: "The report could not be opened.", reportNothingToShow: "Run an analysis first — there is nothing to report yet.", reportUnreadable: "This report could not be read from browser storage.", reportOpened: "Report opened in a new tab.", reportOpenManually: "Copy this address into a new tab to open the report:", reportExpired: "This report has expired. Reports are kept for the current browser session only — run the analysis again to make a new one.", analysisFailed: "The analysis could not be completed.", analysisEmpty: "The provider replied, but returned no usable analysis. Try again, or switch model.", analysing: "Analysing with {model} — {seconds}s elapsed, usually about {estimate}s", analysingOvertime: "Analysing with {model} — {seconds}s elapsed, longer than usual",
    verdictStrongFit: "Apply", verdictWorthApplying: "Worth applying", verdictStretch: "Fix gaps first", verdictWeakFit: "Probably skip", howToClose: "How to close it:",
    verdictStrongFitSub: "Your CV already covers what this posting screens on.", verdictWorthApplyingSub: "The core is evidenced; what is left is worth an evening.", verdictStretchSub: "Something the posting screens on is missing. Reachable, but not tonight without work.", verdictWeakFitSub: "Several screening requirements are unevidenced. Spend the evening elsewhere unless you want this employer specifically.",
    verdictScore: "{total} required areas · {met} evidenced · {partial} partial · {missing} missing", decisiveFactor: "What would change this:",
    effortQuick: "About 30 min of CV edits", effortEvening: "One evening", effortMultiDay: "More than one evening", effortNotClosable: "Cannot be closed before applying",
    levelStepUp: "Step up", levelLateral: "Lateral move", levelStepDown: "Step down", levelUnclearScope: "Scope not stated",
    statedConditions: "Conditions the employer states", conditionSponsorship: "Sponsorship", conditionWorkAuthorization: "Work authorization", conditionCitizenship: "Citizenship", conditionClearance: "Clearance", conditionOnsiteLocation: "On-site", conditionLicence: "Licence", conditionOther: "Condition", conditionNote: "Quoted from the posting. Check it against your own situation before applying.",
    screeningKnockout: "Hard filter", recencyDated: "dated in your CV", recencyUndated: "undated in your CV", notClosableBefore: "Cannot be closed before applying:", verdictMissing: "The model returned no overall verdict. The requirement comparison below still stands.",
    sectionPrepare: "Prepare", sectionVerify: "Check before applying", noRequirements: "The model returned no specific requirements for this posting.",
    matchStrong: "Strong", matchPartial: "Partial", matchGap: "Gap", matchNoEvidence: "No evidence",
    levelRequired: "Required", levelPreferred: "Preferred", levelUnclear: "Unclear",
    priorityNow: "Before you decide", priorityBeforeApply: "Before you send it", priorityLater: "After you apply",
    severityMaterial: "Material", severityModerate: "Moderate", severityUnknown: "Unclear"
  },
  zh: {
    appTitle: "MarketFit", language: "界面语言", temporary: "PDF 简历和当前职位默认只保留在此侧栏中；仅在你主动运行 AI 分析时才会进行额外传输。",
    profile: "你的资料", resumePdf: "PDF 简历", noResume: "尚未选择 PDF 简历。", uploadHint: "1. 上传可提取文字的 PDF 简历。2. 打开完整职位详情页、选择 AI 提供商后，运行 AI 分析。", market: "目标市场", workAuthorization: "工作授权", clearSession: "清除本地会话",
    authorized: "已具备工作授权", needsSponsorship: "需要雇主担保", openWorkPermit: "开放工作许可", studentGraduate: "学生或毕业生路径", temporaryRoute: "其他临时路径", unknown: "未知",
    currentJob: "当前职位", refreshJob: "重新读取职位页", editJob: "编辑职位文本", close: "关闭", jobTitle: "职位名称", company: "公司", jobLocation: "地点", jobDescriptionText: "职位描述", saveJobText: "使用这份 JD",
    noData: "上传 PDF 简历、选择 AI 提供商后，在打开完整职位详情页时运行 AI 分析。", missingResume: "请先上传 PDF 简历，再分析职位。", capturing: "正在读取当前职位页面", captureBlocked: "暂时无法读取此页面。", noJobContent: "未在此页面找到可用的职位描述。", grantSiteAccess: "允许读取此网站", accessDenied: "未获得网站读取权限。允许后可再次尝试。", lowConfidence: "职位页面已抓取，但关键信息不完整。请打开完整职位详情后重试。", lowQualityJob: "读取到的职位文本过短或不完整（{chars} 个字符）。请重新读取页面，或编辑/粘贴 JD。", jobQualityLine: "{chars} 字符 · {method} · {confidence}% 置信度", capturedJobStats: "职位已可用于 AI：{chars} 个字符，{confidence}% 置信度。", jobReadyForAi: "职位页面已就绪。请选择 AI 提供商并运行分析。",
    pdfReading: "正在本地读取 PDF", pdfReady: "{name} 已就绪：{pages} 页。", pdfTruncated: "{name} 已就绪；仅使用前 60,000 个字符。", pdfFailed: "无法使用该 PDF。",
    agentHeading: "AI 职位分析", agentExplain: "AI 会读完整份 PDF 简历和当前职位页面，告诉你要不要投、每条要求对照你的简历是什么情况、缺什么、以及怎么准备。",
    chooseProvider: "选择提供商", provider: "AI 提供商", openaiApi: "OpenAI", anthropicApi: "Anthropic", deepseekApi: "DeepSeek", sessionApiKey: "会话 API Key", apiModel: "模型",
    openAiGpt5Mini: "GPT-5 mini（更快、成本更低）", openAiGpt5: "GPT-5（能力更强）", anthropicSonnet5: "Claude Sonnet 5（均衡）", anthropicOpus5: "Claude Opus 5（能力最强）", anthropicSonnet46: "Claude Sonnet 4.6（成本更低）", anthropicOpus46: "Claude Opus 4.6", deepseekChat: "DeepSeek V3（更快、成本更低）", deepseekReasoner: "DeepSeek R1（推理模型）",
    runAiReview: "用 AI 分析当前职位", apiDirectHelp: "会话 API Key 只保留在当前打开的侧栏中。MarketFit 会在直连该提供商前请求权限，不使用本地 Bridge，也不会保存 Key。", agentPrivacy: "运行分析时，会把 PDF 简历文字和抓取到的职位页面直接发送给你选择的提供商，不发给任何其他方。API Key 只保留在当前打开的侧栏中，不会被保存。",
    privacy: "隐私与权限", privacyExplain: "默认的 PDF 解析和页面抓取都在本地完成。仅在你主动运行 AI 分析时才会发生数据传输。", previewPayload: "预览可选 AI 负载", extensionPermission: "仅在你选择某个提供商时，才会请求访问它的 API 域名。",
    permActiveTab: "在你点击后抓取当前可见页面。", permScripting: "运行那一次性的可见页面提取脚本。", permStorage: "保存界面语言和历次分析耗时；PDF 文件和 API Key 从不保存。", permSidePanel: "显示此侧栏工作区。",
    chooseProviderFirst: "请先选择 AI 提供商。", aiFinished: "已使用 {provider} 完成 AI 分析。", requestingAi: "职位已读取，正在请求 AI 分析", apiKeyNeeded: "请为选定提供商填写会话 API Key。", directAccessDenied: "未允许直连所选 AI 提供商。", retryAccess: "允许访问该提供商", aiSupplement: "由 AI 生成，仅依据你的简历和这个职位页面。重要信息请自己核实之后再行动。",
    jobUnderstanding: "这个岗位具体做什么", candidatePositioning: "你的定位", fitNarrative: "你和岗位怎么对上", evidenceRequirements: "岗位要求", aiStrengths: "你的最强项", aiGaps: "需要补齐的缺口", aiRisks: "需要核实的风险", resumeTailoring: "简历优化方向", interviewFocus: "面试准备重点", employerQuestions: "可以问雇主的问题", suggestedActions: "接下来做什么", actionStepsHint: "按顺序来。这份分析要你做的事，都在这一份清单里。",
    openReport: "打开完整报告", reportPrint: "打印或另存为 PDF", reportModel: "分析模型", reportGenerated: "生成时间", reportSource: "来源", reportFailed: "无法打开报告。", reportNothingToShow: "请先运行一次分析，目前还没有可生成的报告。", reportUnreadable: "无法从浏览器存储中读取该报告。", reportOpened: "报告已在新标签页中打开。", reportOpenManually: "把下面的地址复制到新标签页即可打开报告：", reportExpired: "该报告已失效。报告仅在当前浏览器会话内保留，请重新运行分析以生成新的报告。", analysisFailed: "分析未能完成。", analysisEmpty: "AI 服务响应了，但没有给出可用的分析结果。请重试或换一个模型。", analysing: "正在使用 {model} 分析 — 已用 {seconds} 秒，通常约 {estimate} 秒", analysingOvertime: "正在使用 {model} 分析 — 已用 {seconds} 秒，比平常久一些",
    verdictStrongFit: "可以直接投", verdictWorthApplying: "值得投递", verdictStretch: "补齐后再投", verdictWeakFit: "建议先跳过", howToClose: "怎么补齐：",
    verdictStrongFitSub: "这个岗位筛人看的东西，你的简历已经覆盖了。", verdictWorthApplyingSub: "核心要求都有证据，剩下的值得花一个晚上补。", verdictStretchSub: "有一项筛人的要求确实缺失。够得着，但今晚直接投不合适。", verdictWeakFitSub: "多项筛人的要求在简历里没有证据。除非你特别想去这家公司，否则今晚的时间花在别处更值。",
    verdictScore: "{total} 项必需要求 · {met} 项有证据 · {partial} 项部分满足 · {missing} 项缺失", decisiveFactor: "什么能改变这个结论：",
    effortQuick: "改简历约 30 分钟", effortEvening: "一个晚上", effortMultiDay: "不止一个晚上", effortNotClosable: "投递前补不上",
    levelStepUp: "往上一级", levelLateral: "平级", levelStepDown: "往下一级", levelUnclearScope: "职责范围未写明",
    statedConditions: "雇主明确写出的条件", conditionSponsorship: "签证担保", conditionWorkAuthorization: "工作授权", conditionCitizenship: "国籍", conditionClearance: "安全审查", conditionOnsiteLocation: "现场办公", conditionLicence: "执照资质", conditionOther: "其他条件", conditionNote: "以上为职位页面原文所述。投递前请对照你自己的情况核实。",
    screeningKnockout: "硬性门槛", recencyDated: "简历中时间较早", recencyUndated: "简历中未注明时间", notClosableBefore: "投递前补不上：", verdictMissing: "AI 未给出总体结论。下方的逐条要求比对仍然有效。",
    sectionPrepare: "准备", sectionVerify: "投递前核实", noRequirements: "没能从这个职位页面里读出具体要求。",
    matchStrong: "满足", matchPartial: "部分满足", matchGap: "不满足", matchNoEvidence: "简历未提及",
    levelRequired: "必需项", levelPreferred: "加分项", levelUnclear: "未说明",
    priorityNow: "决定前", priorityBeforeApply: "投递前", priorityLater: "投递之后",
    severityMaterial: "严重", severityModerate: "中等", severityUnknown: "待确认"
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
