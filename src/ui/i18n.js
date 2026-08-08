export const MESSAGES = {
  en: {
    appTitle: "MarketFit", language: "Language", temporary: "Your PDF resume and captured job stay in this panel unless you explicitly run AI analysis.",
    profile: "Your profile", resumePdf: "CV PDF", noResume: "No resume PDF selected.", uploadHint: "1. Upload a text-based PDF resume. 2. Open a full job posting tab, choose an AI provider, then run AI analysis.", workAuthorization: "Work authorization", clearSession: "Clear local session",
    authorized: "Already authorized", needsSponsorship: "Needs sponsorship", openWorkPermit: "Open work permit", studentGraduate: "Student or graduate route", temporaryRoute: "Other temporary route", unknown: "Unknown",
    currentJob: "Current job", refreshJob: "Re-read job page", editJob: "Edit job text", close: "Close", jobTitle: "Job title", company: "Company", jobLocation: "Location", jobDescriptionText: "Job description", saveJobText: "Use this JD",
    noData: "Upload a CV PDF, choose an AI provider, then run AI analysis while the full job posting is open.", missingResume: "Upload a CV PDF before analysing a job.", capturing: "Reading the current job page", captureBlocked: "This page cannot be read yet.", noJobContent: "No usable job description was found on this page.", grantSiteAccess: "Allow reading this site", accessDenied: "Site access was not granted. You can allow it and try again.",
    accessNeeded: "MarketFit needs your permission to read this site.", accessNeededWhy: "Nothing has gone wrong. Chrome asks once per site and only you can allow it — after that, analysing jobs on this site works straight away.", lowConfidence: "The page was captured, but job details are incomplete. Open the full job posting and try again.", lowQualityJob: "The captured job text is too short or incomplete ({chars} characters). Re-read the page or edit/paste the JD.", jobQualityLine: "{chars} chars · {method} · {confidence}% confidence", filteredLines: "· {count} page elements filtered out", filteredTitle: "Removed before sending:", capturedJobStats: "Job ready for AI: {chars} characters, {confidence}% confidence.", jobReadyForAi: "Job page is ready. Choose an AI provider and run analysis.",
    pdfReading: "Reading your PDF locally", pdfReady: "{name} ready: {pages} page(s).", pdfTruncated: "{name} is ready; only the first 60,000 characters are used.", pdfFailed: "The PDF could not be used.",
    agentHeading: "AI job analysis", agentExplain: "AI reads your full PDF CV and the current job page, then tells you whether to apply, what each requirement looks like against your CV, what is missing, and how to prepare.",
    chooseProvider: "Choose a provider", provider: "AI provider", openaiApi: "OpenAI", anthropicApi: "Anthropic", deepseekApi: "DeepSeek", sessionApiKey: "Session API key", apiModel: "Model",
    openAiGpt5Mini: "GPT-5 mini (faster, lower cost)", openAiGpt5: "GPT-5 (more capable)", anthropicSonnet46: "Claude Sonnet 4.6 (lower cost)", anthropicOpus46: "Claude Opus 4.6", deepseekV4Flash: "DeepSeek V4 Flash (faster, lower cost)", deepseekV4Pro: "DeepSeek V4 Pro (more capable)",
    runAiReview: "Analyze current job with AI", apiDirectHelp: "The session key remains only in this open panel. MarketFit asks before connecting directly to this provider, and never saves the key.", agentPrivacy: "Running an analysis sends the PDF-derived CV text and the captured job page directly to the provider you chose, and to no one else. Your API key stays in this open panel and is never saved.",
    privacy: "Privacy and permissions", privacyExplain: "Default PDF parsing and page capture stay local. AI transfer occurs only after you explicitly run it.", previewPayload: "Preview optional AI payload", extensionPermission: "Access to a provider\u2019s API domain is requested only when you select it.",
    permActiveTab: "capture the current visible page after a click.", permScripting: "run that one-time visible-page extractor.", permStorage: "save interface language and how long past analyses took; PDF files and API keys are never stored.", permSidePanel: "show this workspace.",
    chooseProviderFirst: "Choose an AI provider first.", aiFinished: "AI analysis completed with {provider}.", requestingAi: "Job captured. Requesting AI analysis", apiKeyNeeded: "Enter a session API key for the selected provider.", directAccessDenied: "Direct access to the selected AI provider was not allowed.", retryAccess: "Allow provider access", aiSupplement: "AI-generated analysis, drawn only from your CV and this job page. Verify anything material before acting.",
    jobUnderstanding: "What this role is", candidatePositioning: "Your positioning", fitNarrative: "How you line up", evidenceRequirements: "Requirements", aiStrengths: "Where you are strongest", aiGaps: "Gaps to close", aiRisks: "Risks in the role itself", profileRisks: "What a screener may hesitate over", howToAddress: "What to say about it:", resumeTailoring: "Tailor your CV", interviewFocus: "What they will ask you", employerQuestions: "What to ask them", cvBlindSpots: "What your CV leaves unanswered", suggestedActions: "Do this next", actionStepsHint: "In order. Everything the analysis asks of you is on this list.", marketConventions: "What this market also weighs", marketConventionsNote: "Common hiring conventions in {market}, hand-maintained and last reviewed {reviewed}. These do not come from this posting.", marketYourStanding: "Where you stand:", marketCn: "mainland China", marketNlWeu: "the Netherlands",
    openReport: "Open full report", reportPrint: "Print or save as PDF", reportModel: "Analysed by", reportGenerated: "Generated", reportSource: "Source", reportFailed: "The report could not be opened.", reportNothingToShow: "Run an analysis first — there is nothing to report yet.", reportUnreadable: "This report could not be read from browser storage.", reportOpened: "Report opened in a new tab.", reportOpenManually: "Copy this address into a new tab to open the report:", reportExpired: "This report has expired. Reports are kept for the current browser session only — run the analysis again to make a new one.", analysisFailed: "The analysis could not be completed.", analysisEmpty: "The provider replied, but returned no usable analysis. Try again, or switch model.", analysing: "Analysing with {model} — {seconds}s elapsed, usually about {estimate}s", analysingOvertime: "Analysing with {model} — {seconds}s elapsed, longer than usual",
    streamThinking: " · thinking, no answer text yet", streamWriting: " · writing since {start}s ({chars} chars)",
    verdictStrongFit: "Apply", verdictWorthApplying: "Worth applying", verdictStretch: "Fix gaps first", verdictWeakFit: "Probably skip", howToClose: "How to close it:",
    verdictStrongFitSub: "Your CV already covers what this posting screens on.", verdictWorthApplyingSub: "The core is evidenced; what is left is worth an evening.", verdictStretchSub: "Something the posting screens on is missing. Reachable, but not tonight without work.", verdictWeakFitSub: "Several screening requirements are unevidenced. Spend the evening elsewhere unless you want this employer specifically.",
    verdictScore: "{total} required areas · {met} evidenced · {partial} partial · {missing} missing", decisiveFactor: "What would change this:",
    effortQuick: "Under 30 min — wording only", effortEvening: "One evening — something to write", effortMultiDay: "More than one evening — new work", effortNotClosable: "Cannot be closed before applying",
    levelStepUp: "Step up", levelLateral: "Lateral move", levelStepDown: "Step down", levelUnclearScope: "Scope not stated",
    verdictDowngraded: "Lowered because the employer's stated condition conflicts with the work authorization you selected. Check it yourself before deciding.",
    alignmentConflict: "Conflicts with the work authorization you selected. Verify this before spending an evening on it.",
    alignmentVerify: "Your selected route may or may not satisfy this. Ask the employer before applying.",
    alignmentSupported: "The employer offers this, which is what you said you need.",
    statusReady: "Ready", reportLoading: "Loading report…", chooseFile: "Choose a PDF", changeFile: "Change file",
    apiKeyWhere: "Get a key:", apiKeyOnceOnly: "The key is shown once — if you lose it, create another.",
    apiKeyHelpOpenaiApi: "Sign in, open the API keys page, and create a secret key. It needs credit on the account: a new key with no billing set up fails on the first call. Starts with sk-.",
    apiKeyHelpAnthropicApi: "Sign in and create a key under Settings, API keys. It needs credit on the account: a new key with no billing set up fails on the first call. Starts with sk-ant-.",
    apiKeyHelpDeepseekApi: "Sign in, open the API keys page, and create a key. It needs a topped-up balance: a new key with no credit fails on the first call. Starts with sk-.",
    apiKeyMismatch: "This looks like an Anthropic key. Select Anthropic, or paste the key for the provider you chose.",
    authHelpAuthorized: "You can already work in that market without the employer doing anything — citizen, permanent resident, or a permit already in hand.",
    authHelpNeedsSponsorship: "The employer would have to apply for a work visa for you before you could start.",
    authHelpOpenWorkPermit: "You hold a permit that is not tied to one employer, so you can start directly — often with an expiry date.",
    authHelpStudentOrGraduate: "You work on a student or post-study route, such as a graduate visa. Usually time-limited and sometimes hour-limited.",
    authHelpTemporaryRoute: "Another time-limited or conditional status.",
    authHelpUnknown: "Not used in the analysis. Pick your actual situation and stated conditions will be checked against it.",
    statedConditions: "Conditions the employer states", conditionSponsorship: "Sponsorship", conditionWorkAuthorization: "Work authorization", conditionCitizenship: "Citizenship", conditionClearance: "Clearance", conditionOnsiteLocation: "On-site", conditionLicence: "Licence", conditionOther: "Condition", conditionNote: "Quoted from the posting. Check it against your own situation before applying.", conditionAsk: "Ask them:",
    screeningKnockout: "Hard filter", recencyDated: "dated in your CV", recencyUndated: "undated in your CV", notClosableBefore: "Cannot be closed before applying:", verdictMissing: "The model returned no overall verdict. The requirement comparison below still stands.",
    qualityCvTruncated: "Only the first 60,000 characters of your CV were read, so anything past that was not analysed.", qualityFiltered: "{count} page elements were removed from the posting before analysis — if a requirement looks missing, check the page itself.", qualityPasted: "The posting analysed is the text you pasted, not the live page.",
    noticeVerdictEffort: "The verdict and the effort estimate disagree: a CV that already covers what this posting screens on should not cost more than an evening. Weigh the requirements below over the word above.",
    noticeLooseKnockouts: "{count} requirements are marked hard filters. Most postings have at most one, so read the order below as approximate rather than as what actually screens you out.",
    noticeGapActions: "{gaps} gaps say they can be closed before applying, but the plan lists {actions} actions — some of the advice above did not make it into this list.",
    sectionPrepare: "Prepare", sectionVerify: "Check before applying", noRequirements: "The model returned no specific requirements for this posting.",
    screeningHeading: "Whether your CV gets read", screeningNote: "Wording, not ability — these are the words a recruiter searches for. A term missing next to a requirement you meet means you do the work and your CV never says so.",
    presenceVerbatim: "In your CV", presenceVariant: "Different words", presenceAbsent: "Not in your CV", screeningCvWording: "yours: {wording}",
    titleSame: "Same title", titleAdjacent: "Neighbouring title", titleDistant: "Distant title",
    matchStrong: "Met", matchPartial: "Partly met", matchGap: "Not met", matchNoEvidence: "Not in your CV",
    levelRequired: "Required", levelPreferred: "Preferred", levelUnclear: "Unclear",
    priorityNow: "Before you decide", priorityBeforeApply: "Before you send it", priorityLater: "After you apply",
    severityMaterial: "Serious", severityModerate: "Moderate", severityUnknown: "Unconfirmed",
    // Error sentences, keyed by the code the throwing layer attaches. See errorText.
    redactedEmail: "[email removed]", redactedPhone: "[phone removed]", redactedLink: "[link removed]",
    previewNoteDirect: "Preview only. Running AI analysis would send the CV and job text below directly to {provider}.",
    previewNotePending: "Preview only. Nothing is sent until you choose an AI provider and run the analysis.",
    providerAccessMissing: "MarketFit cannot reach this provider yet. Select the provider again to grant access.",
    providerUnsupported: "That AI provider is not supported.",
    providerUnreadable: "The AI provider returned a response MarketFit could not read. Try again, or switch model.",
    providerTimeout: "The AI provider did not finish in time. Try a faster model, or shorten the job description.",
    providerUnreachable: "The AI provider could not be reached. Check your connection and try again.",
    providerUnreachableCause: "The AI provider could not be reached ({cause}). Check your connection and try again.",
    providerStreamInterrupted: "The AI provider started answering and then stopped ({cause}). Nothing was lost on your side — try again.",
    providerStreamUnreadable: "MarketFit could not read the streamed response from this provider. Please report this — it is a bug in MarketFit, not in your key or your setup.",
    providerKeyRejected: "The AI provider rejected the API key (HTTP {status}). Check the key and try again.",
    providerRateLimited: "The AI provider is rate limiting this key (HTTP {status}). Wait a moment and try again.",
    providerUnavailable: "The AI provider is unavailable right now (HTTP {status}). Try again shortly.",
    providerRejected: "The AI provider rejected the request (HTTP {status}).",
    OUTPUT_TRUNCATED: "The AI ran out of output space before finishing. Try a shorter job description, or switch model.",
    OUTPUT_UNTRUSTED: "The AI replied, but not with a usable analysis. Try again, or switch model.",
    OUTPUT_NO_FINDINGS: "The AI replied in the right shape, but not one section held a usable finding. Try again, or switch model.",
    OUTPUT_EMPTY: "The AI service returned an empty response. This is usually transient — try again, and switch model if it keeps happening.",
    SCHEMA_INVALID: "MarketFit could not build a valid request from this job and CV.",
    PAYLOAD_TOO_LARGE: "This request is too large. Shorten the CV or the job description.",
    CREDENTIAL_INVALID: "That API key looks incomplete. Check it and try again.",
    pdfMissing: "Choose a PDF CV first.",
    pdfNotPdf: "Only PDF CVs are supported.",
    pdfTooLarge: "That PDF is too large. Use a file under {mb} MB.",
    pdfEmpty: "That PDF file is empty.",
    pdfTooManyPages: "That PDF has too many pages. Use a CV of {pages} pages or fewer.",
    pdfNoText: "No selectable text was found. Upload a text-based PDF, not a scanned image.",
    pdfPassword: "That PDF is password protected. Upload an unlocked copy.",
    pdfNotReadable: "That file is not a readable PDF.",
    pdfUnreadable: "That PDF could not be read on this device.",
    // Capture internals that used to reach the panel as raw tokens.
    methodSchemaOrgJsonld: "structured page data", methodSemanticSelector: "page layout", methodManualPaste: "your pasted text", methodEmpty: "nothing readable",
    methodGreenhouseAdapter: "Greenhouse", methodLeverAdapter: "Lever", methodWorkdayAdapter: "Workday", methodGenericSpaAdapter: "dynamic page",
    NO_JOB_CONTENT: "no job text was found", JOB_TEXT_TOO_SHORT: "the job text is too short",
    NO_JOB_STRUCTURE_SIGNALS: "no requirements or responsibilities section was found",
    LIKELY_NAV_OR_LOGIN_TEXT: "the page looks like navigation or a sign-in wall"
  },
  zh: {
    appTitle: "MarketFit", language: "界面语言", temporary: "PDF 简历和当前职位默认只保留在此侧栏中；仅在你主动运行 AI 分析时才会进行额外传输。",
    profile: "你的资料", resumePdf: "PDF 简历", noResume: "尚未选择 PDF 简历。", uploadHint: "1. 上传可提取文字的 PDF 简历。2. 打开完整职位详情页、选择 AI 提供商后，运行 AI 分析。", workAuthorization: "工作授权", clearSession: "清除本地会话",
    authorized: "已具备工作授权", needsSponsorship: "需要雇主担保", openWorkPermit: "开放工作许可", studentGraduate: "学生或毕业生路径", temporaryRoute: "其他临时路径", unknown: "未知",
    currentJob: "当前职位", refreshJob: "重新读取职位页", editJob: "编辑职位文本", close: "关闭", jobTitle: "职位名称", company: "公司", jobLocation: "地点", jobDescriptionText: "职位描述", saveJobText: "使用这份 JD",
    noData: "上传 PDF 简历、选择 AI 提供商后，在打开完整职位详情页时运行 AI 分析。", missingResume: "请先上传 PDF 简历，再分析职位。", capturing: "正在读取当前职位页面", captureBlocked: "暂时无法读取此页面。", noJobContent: "未在此页面找到可用的职位描述。", grantSiteAccess: "允许读取此网站", accessDenied: "未获得网站读取权限。允许后可再次尝试。",
    accessNeeded: "MarketFit 需要你授权读取这个网站。", accessNeededWhy: "这不是出错。Chrome 对每个网站只会询问一次，而且只能由你本人授权；授权之后，在这个网站上分析职位就能直接使用。", lowConfidence: "职位页面已抓取，但关键信息不完整。请打开完整职位详情后重试。", lowQualityJob: "读取到的职位文本过短或不完整（{chars} 个字符）。请重新读取页面，或编辑/粘贴 JD。", jobQualityLine: "{chars} 字符 · {method} · {confidence}% 置信度", filteredLines: "· 已滤除 {count} 处页面元素", filteredTitle: "发送前已移除：", capturedJobStats: "职位已可用于 AI：{chars} 个字符，{confidence}% 置信度。", jobReadyForAi: "职位页面已就绪。请选择 AI 提供商并运行分析。",
    pdfReading: "正在本地读取 PDF", pdfReady: "{name} 已就绪：{pages} 页。", pdfTruncated: "{name} 已就绪；仅使用前 60,000 个字符。", pdfFailed: "无法使用该 PDF。",
    agentHeading: "AI 职位分析", agentExplain: "AI 会读完整份 PDF 简历和当前职位页面，告诉你要不要投、每条要求对照你的简历是什么情况、缺什么、以及怎么准备。",
    chooseProvider: "选择提供商", provider: "AI 提供商", openaiApi: "OpenAI", anthropicApi: "Anthropic", deepseekApi: "DeepSeek", sessionApiKey: "会话 API Key", apiModel: "模型",
    openAiGpt5Mini: "GPT-5 mini（更快、成本更低）", openAiGpt5: "GPT-5（能力更强）", anthropicSonnet46: "Claude Sonnet 4.6（成本更低）", anthropicOpus46: "Claude Opus 4.6", deepseekV4Flash: "DeepSeek V4 Flash（更快、成本更低）", deepseekV4Pro: "DeepSeek V4 Pro（能力更强）",
    runAiReview: "用 AI 分析当前职位", apiDirectHelp: "会话 API Key 只保留在当前打开的侧栏中。MarketFit 会在直连该服务前请求权限，也不会保存 Key。", agentPrivacy: "运行分析时，会把 PDF 简历文字和抓取到的职位页面直接发送给你选择的提供商，不发给任何其他方。API Key 只保留在当前打开的侧栏中，不会被保存。",
    privacy: "隐私与权限", privacyExplain: "默认的 PDF 解析和页面抓取都在本地完成。仅在你主动运行 AI 分析时才会发生数据传输。", previewPayload: "预览可选 AI 负载", extensionPermission: "仅在你选择某个提供商时，才会请求访问它的 API 域名。",
    permActiveTab: "在你点击后抓取当前可见页面。", permScripting: "运行那一次性的可见页面提取脚本。", permStorage: "保存界面语言和历次分析耗时；PDF 文件和 API Key 从不保存。", permSidePanel: "显示此侧栏工作区。",
    chooseProviderFirst: "请先选择 AI 提供商。", aiFinished: "已使用 {provider} 完成 AI 分析。", requestingAi: "职位已读取，正在请求 AI 分析", apiKeyNeeded: "请为选定提供商填写会话 API Key。", directAccessDenied: "未允许直连所选 AI 提供商。", retryAccess: "允许访问该提供商", aiSupplement: "由 AI 生成，仅依据你的简历和这个职位页面。重要信息请自己核实之后再行动。",
    jobUnderstanding: "这个岗位具体做什么", candidatePositioning: "你的定位", fitNarrative: "你和岗位怎么对上", evidenceRequirements: "岗位要求", aiStrengths: "你的最强项", aiGaps: "需要补齐的缺口", aiRisks: "这份工作本身的风险", profileRisks: "简历本身可能让人犹豫的地方", howToAddress: "可以这样说明：", resumeTailoring: "简历优化方向", interviewFocus: "他们会问你什么", employerQuestions: "你该问他们什么", cvBlindSpots: "你的简历没说清楚的地方", suggestedActions: "接下来做什么", actionStepsHint: "按顺序来。这份分析要你做的事，都在这一份清单里。", marketConventions: "这个市场还会看什么", marketConventionsNote: "{market}的通行招聘惯例，由人工整理维护，最近一次核实于{reviewed}，不来自本次招聘启事。", marketYourStanding: "你的位置：", marketCn: "中国内地", marketNlWeu: "荷兰",
    openReport: "打开完整报告", reportPrint: "打印或另存为 PDF", reportModel: "分析模型", reportGenerated: "生成时间", reportSource: "来源", reportFailed: "无法打开报告。", reportNothingToShow: "请先运行一次分析，目前还没有可生成的报告。", reportUnreadable: "无法从浏览器存储中读取该报告。", reportOpened: "报告已在新标签页中打开。", reportOpenManually: "把下面的地址复制到新标签页即可打开报告：", reportExpired: "该报告已失效。报告仅在当前浏览器会话内保留，请重新运行分析以生成新的报告。", analysisFailed: "分析未能完成。", analysisEmpty: "AI 服务响应了，但没有给出可用的分析结果。请重试或换一个模型。", analysing: "正在使用 {model} 分析 — 已用 {seconds} 秒，通常约 {estimate} 秒", analysingOvertime: "正在使用 {model} 分析 — 已用 {seconds} 秒，比平常久一些",
    streamThinking: " · 思考中，还没有开始作答", streamWriting: " · 从第 {start} 秒开始作答（已收到 {chars} 字符）",
    verdictStrongFit: "可以直接投", verdictWorthApplying: "值得投递", verdictStretch: "补齐后再投", verdictWeakFit: "建议先跳过", howToClose: "怎么补齐：",
    verdictStrongFitSub: "这个岗位筛人看的东西，你的简历已经覆盖了。", verdictWorthApplyingSub: "核心要求都有证据，剩下的值得花一个晚上补。", verdictStretchSub: "有一项筛人的要求确实缺失。够得着，但今晚直接投不合适。", verdictWeakFitSub: "多项筛人的要求在简历里没有证据。除非你特别想去这家公司，否则今晚的时间花在别处更值。",
    verdictScore: "{total} 项必需要求 · {met} 项有证据 · {partial} 项部分满足 · {missing} 项缺失", decisiveFactor: "什么能改变这个结论：",
    effortQuick: "半小时内，只改措辞", effortEvening: "一个晚上，要写点东西", effortMultiDay: "不止一晚，需要新做点东西", effortNotClosable: "投递前补不上",
    levelStepUp: "往上一级", levelLateral: "平级", levelStepDown: "往下一级", levelUnclearScope: "职责范围未写明",
    verdictDowngraded: "已下调：雇主写明的条件与你选择的工作授权状态冲突。做决定前请自行核实。",
    alignmentConflict: "与你选择的工作授权状态冲突。在为它花掉一个晚上之前，先核实这一条。",
    alignmentVerify: "你选择的身份路径不一定满足这一条。投递前问清楚雇主。",
    alignmentSupported: "雇主明确提供这一项，正是你所需要的。",
    statusReady: "就绪", reportLoading: "正在载入报告…", chooseFile: "选择 PDF 简历", changeFile: "更换文件",
    apiKeyWhere: "去哪里拿：", apiKeyOnceOnly: "Key 只在创建时显示一次，丢了就重新建一个。",
    apiKeyHelpOpenaiApi: "登录后进入 API keys 页面创建一个密钥。账户必须有余额：新建的 Key 若没有配置付费，第一次调用就会失败。以 sk- 开头。",
    apiKeyHelpAnthropicApi: "登录后在 Settings → API keys 里创建。账户必须有余额：新建的 Key 若没有配置付费，第一次调用就会失败。以 sk-ant- 开头。",
    apiKeyHelpDeepseekApi: "登录后进入 API keys 页面创建一个密钥。账户必须先充值：余额为零时第一次调用就会失败。以 sk- 开头。",
    apiKeyMismatch: "这看起来是 Anthropic 的 Key。请改选 Anthropic，或换成你所选服务的 Key。",
    authHelpAuthorized: "你在该市场已经可以直接工作，雇主不需要为你做任何事——本国公民、永久居留，或已经拿到的工作许可。",
    authHelpNeedsSponsorship: "你需要雇主先为你申请工作签证，才能入职。",
    authHelpOpenWorkPermit: "你持有不绑定单一雇主的工作许可，可以直接入职，通常有有效期。",
    authHelpStudentOrGraduate: "你靠学生签或毕业生路径工作，例如毕业生签证。通常有时限，有时还有工时限制。",
    authHelpTemporaryRoute: "其他有时限或附条件的身份。",
    authHelpUnknown: "不参与分析。选择你的真实情况后，雇主写明的条件才会与它对照。",
    statedConditions: "雇主明确写出的条件", conditionSponsorship: "签证担保", conditionWorkAuthorization: "工作授权", conditionCitizenship: "国籍", conditionClearance: "安全审查", conditionOnsiteLocation: "现场办公", conditionLicence: "执照资质", conditionOther: "其他条件", conditionNote: "以上为职位页面原文所述。投递前请对照你自己的情况核实。", conditionAsk: "可以这样问：",
    screeningKnockout: "硬性门槛", recencyDated: "简历中时间较早", recencyUndated: "简历中未注明时间", notClosableBefore: "投递前补不上：", verdictMissing: "AI 未给出总体结论。下方的逐条要求比对仍然有效。",
    qualityCvTruncated: "只读取了简历的前 60,000 个字符，超出的部分没有参与这次分析。", qualityFiltered: "分析前从职位页面移除了 {count} 处元素——如果某条要求看起来缺失，请回页面确认。", qualityPasted: "这次分析用的是你粘贴的职位文本，不是页面实时内容。",
    noticeVerdictEffort: "结论和工作量估计互相矛盾：如果简历已经覆盖了这个岗位筛人看的东西，就不该还要花掉一个晚上以上。请以下方的逐条要求为准，而不是上面那个词。",
    noticeLooseKnockouts: "有 {count} 项要求被标为硬性门槛。多数职位最多只有一项，所以下面的排序只能当作大致参考，不等于真正会把你筛掉的条件。",
    noticeGapActions: "有 {gaps} 项缺口写着投递前可以补上，但清单里只有 {actions} 条行动——上面的部分建议没有进到这份清单里。",
    sectionPrepare: "准备", sectionVerify: "投递前核实", noRequirements: "没能从这个职位页面里读出具体要求。",
    screeningHeading: "你的简历能不能被读到", screeningNote: "这里看的是措辞，不是能力——这些是招聘方会去搜的词。某个词缺失、而对应要求你其实满足，说明活你干过，简历上却没写出这个说法。",
    presenceVerbatim: "简历里有", presenceVariant: "用了别的说法", presenceAbsent: "简历里没有", screeningCvWording: "你写的是：{wording}",
    titleSame: "职位名一致", titleAdjacent: "职位名相邻", titleDistant: "职位名差得远",
    matchStrong: "满足", matchPartial: "部分满足", matchGap: "不满足", matchNoEvidence: "简历未提及",
    levelRequired: "必需项", levelPreferred: "加分项", levelUnclear: "未说明",
    priorityNow: "决定前", priorityBeforeApply: "投递前", priorityLater: "投递之后",
    severityMaterial: "严重", severityModerate: "中等", severityUnknown: "待确认",
    // 错误文案，按抛出层附带的 code 取用，见 errorText。
    redactedEmail: "[已移除邮箱]", redactedPhone: "[已移除电话]", redactedLink: "[已移除链接]",
    previewNoteDirect: "仅为预览。运行 AI 分析时，会把下面的简历与职位文本直接发送给 {provider}。",
    previewNotePending: "仅为预览。在你选择 AI 服务并运行分析之前，不会发送任何内容。",
    providerAccessMissing: "MarketFit 还不能访问这个 AI 服务。请重新选择一次该服务以授权。",
    providerUnsupported: "不支持这个 AI 服务。",
    providerUnreadable: "AI 服务返回了 MarketFit 无法读取的内容。请重试，或更换模型。",
    providerTimeout: "AI 服务在时限内没有完成。可以换更快的模型，或缩短职位描述。",
    providerUnreachable: "无法连接 AI 服务。请检查网络后重试。",
    providerUnreachableCause: "无法连接 AI 服务（{cause}）。请检查网络后重试。",
    providerStreamInterrupted: "AI 服务开始作答后中断了（{cause}）。你这边没有丢失任何内容，请重试。",
    providerStreamUnreadable: "MarketFit 无法解析这个服务返回的流式内容。请反馈这个问题——这是 MarketFit 的缺陷，不是你的 Key 或配置有问题。",
    providerKeyRejected: "AI 服务拒绝了这个 API Key（HTTP {status}）。请检查 Key 后重试。",
    providerRateLimited: "AI 服务对这个 Key 触发了限流（HTTP {status}）。请稍等片刻再试。",
    providerUnavailable: "AI 服务当前不可用（HTTP {status}）。请稍后再试。",
    providerRejected: "AI 服务拒绝了这次请求（HTTP {status}）。",
    OUTPUT_TRUNCATED: "AI 在写完之前用尽了输出空间。请缩短职位描述，或更换模型。",
    OUTPUT_UNTRUSTED: "AI 有响应，但返回的内容不是可用的分析结果。请重试，或更换模型。",
    OUTPUT_NO_FINDINGS: "AI 的回复结构是对的，但没有任何一个部分给出可用的内容。请重试，或更换模型。",
    OUTPUT_EMPTY: "AI 服务返回了空内容。这通常是偶发的——请重试；如果反复出现，请更换模型。",
    SCHEMA_INVALID: "MarketFit 无法用这份职位和简历组装出有效的请求。",
    PAYLOAD_TOO_LARGE: "这次请求太大了。请精简简历或职位描述。",
    CREDENTIAL_INVALID: "这个 API Key 看起来不完整。请检查后重试。",
    pdfMissing: "请先选择一份 PDF 简历。",
    pdfNotPdf: "只支持 PDF 格式的简历。",
    pdfTooLarge: "这份 PDF 太大了。请使用小于 {mb} MB 的文件。",
    pdfEmpty: "这份 PDF 是空文件。",
    pdfTooManyPages: "这份 PDF 页数过多。请使用不超过 {pages} 页的简历。",
    pdfNoText: "没有找到可选中的文字。请上传文字版 PDF，而不是扫描件。",
    pdfPassword: "这份 PDF 有密码保护。请上传未加密的版本。",
    pdfNotReadable: "这个文件不是可读的 PDF。",
    pdfUnreadable: "这份 PDF 在本机无法读取。",
    // 以前直接以机器 token 形式出现在界面上的抓取内部信息。
    methodSchemaOrgJsonld: "页面结构化数据", methodSemanticSelector: "页面版式", methodManualPaste: "你粘贴的文本", methodEmpty: "没有读到内容",
    methodGreenhouseAdapter: "Greenhouse", methodLeverAdapter: "Lever", methodWorkdayAdapter: "Workday", methodGenericSpaAdapter: "动态页面",
    NO_JOB_CONTENT: "没有找到职位正文", JOB_TEXT_TOO_SHORT: "职位正文太短",
    NO_JOB_STRUCTURE_SIGNALS: "没有找到任职要求或岗位职责部分",
    LIKELY_NAV_OR_LOGIN_TEXT: "这个页面看起来是导航栏或登录墙"
  }
};

export function t(locale, key) {
  return MESSAGES[locale]?.[key] || MESSAGES.en[key] || key;
}

/**
 * The message for a thrown error, in the reader's language.
 *
 * Errors are built deep in the provider, PDF and schema layers, which have no
 * locale — so they carry a code and any interpolated values, and the sentence is
 * chosen here. Previously each layer baked an English sentence into the Error and
 * the panel rendered `error.message` verbatim, so a Chinese user hit an English
 * wall the moment anything went wrong.
 *
 * A code with no translation falls back to that English message rather than to the
 * key name: a wrong-language sentence still tells the user what happened, and the
 * audit fails on any code missing from either locale so it does not stay that way.
 */
export function errorText(locale, error, fallbackKey = "analysisFailed") {
  const code = error?.code || "";
  if (code && MESSAGES[locale]?.[code]) return format(locale, code, error.params || {});
  // A provider's own refusal text is the model speaking, already in the output
  // language it was asked for; passing it through beats replacing it with a generic.
  if (error?.message) return error.message;
  return t(locale, fallbackKey);
}

/**
 * The i18n key for one option of a select: optionKey("authHelp", "student_or_graduate")
 * is "authHelpStudentOrGraduate".
 *
 * Exported so the panel and the tests derive keys with the same code rather than
 * two copies of the same regex. They had drifted by one word — the panel asked for
 * authHelpStudentOrGraduate while the string was filed under authHelpStudentGraduate
 * — and t() answers a missing key with the key itself, so the raw name rendered on
 * screen and nothing failed.
 */
export function optionKey(prefix, value) {
  return prefix + String(value ?? "").replace(/(^|_)([a-z])/g, (_, __, letter) => letter.toUpperCase());
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
