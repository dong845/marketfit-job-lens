/**
 * Builds the Web Store screenshot pages from the real renderer and the real
 * stylesheet, with invented data.
 *
 * A screenshot of a genuine run would publish the author's own CV — name, employers,
 * dates — to everyone who opens the listing, and would go stale the moment the panel
 * changes. This regenerates from the shipping code, so the listing cannot drift from
 * the product.
 *
 *   node scripts/build-store-screenshots.mjs <outDir>          # verdict view
 *   SCROLL=-1130 node scripts/build-store-screenshots.mjs <dir> # requirements/actions
 *
 * Then rasterise at 1280x800:
 *   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
 *     --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
 *     --user-data-dir=/tmp/cp --screenshot=out.png --window-size=1280,800 file://.../panel-en.html
 *
 * Headless Chrome writes the PNG and then does not exit on macOS; kill it after.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { renderAnalysisHtml } from "../src/ui/analysisView.js";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const OUT = process.argv[2];
const cite = [{ source: "job", quote: "q", ref: "JD-001" }];

const EVIDENCE = {
  en: {
    recommendation: {
      verdict: "stretch", effort: "evening",
      headline: "Worth an evening once the C++ work reads as production, not research.",
      effortNote: "One evening: rewrite two bullets and add the deployment detail.",
      rationale: "Reconstruction depth and clinical imaging are evidenced directly. C++ appears once in a skills list with nothing behind it, and the posting treats production solvers as core. IEC 62304 is absent entirely.",
      decisiveFactor: "Move the CUDA kernel out of the skills list into an experience bullet with a speedup figure and who used it."
    },
    statedConditions: [{
      type: "sponsorship", stance: "unclear",
      statement: "International candidates are welcome to apply.",
      question: "Does this role come with visa sponsorship, or do you only consider candidates who already hold a Dutch work permit? (ask at the recruiter screen)",
      evidence: cite
    }],
    overview: {
      levelComparison: { direction: "step_up", note: "Owns delivery of the whole reconstruction pipeline and its regulatory file, where the CV shows one component." },
      jobFocus: "Deep-learning reconstruction for clinical MRI, taken from research prototype through to a cleared product.",
      candidatePositioning: "A reconstruction researcher with real clinical data and a measured scan-time result.",
      fitNarrative: "Strong on the algorithm and the clinical data. Thin on everything between a working prototype and a regulated product.",
      evidence: cite
    },
    requirements: [
      { name: "IEC 62304 regulatory submission", level: "required", screening: "weighted", match: "gap", explanation: "Nothing in the CV touches medical-device compliance.", evidence: cite },
      { name: "Production C++ numerical solvers", level: "required", screening: "weighted", match: "partial", recency: "dated", explanation: "The CV says the solver was ported to C++ but not at what scale, with what testing, or who ran it.", evidence: cite },
      { name: "PyTorch deep-learning reconstruction", level: "required", screening: "weighted", match: "strong", recency: "current", explanation: "4D cine MRI reconstruction built in PyTorch, with a 28% scan-time reduction quoted.", evidence: cite },
      { name: "Kubernetes", level: "preferred", screening: "nice_to_have", match: "no_evidence", explanation: "Not mentioned anywhere in the CV.", evidence: cite }
    ],
    strengths: [{ title: "A measured clinical result", summary: "28% off scan time is an outcome, not an activity — most CVs at this level list neither.", evidence: cite }],
    gaps: [
      { title: "No C++ that visibly shipped", severity: "material", closable: "before_apply", summary: "It appears only as a skill.", howToClose: "Tonight, with no new work: turn the CUDA kernel into an experience bullet naming the speedup and who consumed it.", evidence: cite },
      { title: "No regulatory exposure", severity: "material", closable: "not_before_apply", summary: "This one cannot be closed this week.", howToClose: "Say so plainly in the cover letter, and name the verification or documentation work you did do around clinical data.", evidence: cite }
    ],
    risks: [{ title: "How far the regulatory work reaches", severity: "unknown", summary: "The posting mentions submissions once and never says whether this role writes them or supports them.", evidence: cite }],
    resumeTailoring: [{ target: "C++ / CUDA", recommendation: "Promote it out of the skills list into an experience bullet, using the posting's phrase 'production solver'.", evidence: cite }],
    interviewFocus: [{ question: "How did you validate the 28% reduction against clinical ground truth?", rationale: "It is the strongest line in the CV, so it will be probed first.", evidence: cite }],
    uncertainties: [
      { type: "Team size", answeredBy: "employer", message: "How many engineers work on reconstruction today, and who owns the regulatory file? (ask at the hiring-manager call)", evidence: cite },
      { type: "Scope of the C++ port", answeredBy: "you", message: "Say whether that port ran in a clinical environment, what you optimised, and whether it had tests. Right now it reads as a side task.", evidence: cite }
    ],
    suggestedActions: [
      { action: "Confirm you can work in the Netherlands without sponsorship before spending the evening.", priority: "now", evidence: cite },
      { action: "Rewrite the C++/CUDA line as an experience bullet with a speedup figure and a named consumer.", priority: "before_apply", evidence: cite },
      { action: "Add dates and team size to the reconstruction project.", priority: "before_apply", evidence: cite },
      { action: "Ask for a referral through the team's LinkedIn a week after applying.", priority: "later", evidence: cite }
    ]
  }
};

EVIDENCE.zh = JSON.parse(JSON.stringify(EVIDENCE.en));
Object.assign(EVIDENCE.zh.recommendation, {
  headline: "值得花一个晚上——前提是把 C++ 那段写成生产经历，而不是研究副产品。",
  effortNote: "一个晚上：改写两条经历，补上部署细节。",
  rationale: "重建算法深度和临床数据都有直接证据。C++ 只在技能列表里出现过一次，背后没有任何内容，而岗位把生产级求解器当作核心。IEC 62304 完全没有提及。",
  decisiveFactor: "把 CUDA 核那条从技能列表提到经历里，写上加速倍数和谁在用。"
});
EVIDENCE.zh.statedConditions[0].statement = "欢迎国际候选人申请。";
EVIDENCE.zh.statedConditions[0].question = "这个岗位是否提供签证担保，还是只考虑已持有荷兰工作许可的候选人？（在招聘筛选环节问）";
EVIDENCE.zh.overview.levelComparison.note = "要负责整条重建流水线的交付和它的合规文件，而简历目前展示的是其中一个模块。";
Object.assign(EVIDENCE.zh.overview, {
  jobFocus: "面向临床 MRI 的深度学习重建，从研究原型一直做到通过认证的产品。",
  candidatePositioning: "有真实临床数据、并给出了可量化扫描时间结果的重建方向研究者。",
  fitNarrative: "算法和临床数据这一段很强。从能跑的原型到受监管的产品之间，几乎是空白。"
});
const zhReq = ["IEC 62304 法规提交", "生产级 C++ 数值求解器", "PyTorch 深度学习重建", "Kubernetes"];
const zhExp = ["简历中没有任何医疗器械合规相关的内容。", "简历写了把求解器移植到 C++，但没说规模、测试情况，也没说谁在用。", "用 PyTorch 实现 4D cine MRI 重建，并给出扫描时间缩短 28%。", "简历中未提及。"];
EVIDENCE.zh.requirements.forEach((r, i) => { r.name = zhReq[i]; r.explanation = zhExp[i]; });
EVIDENCE.zh.strengths[0] = { title: "一个可量化的临床结果", summary: "扫描时间缩短 28% 是结果，不是活动——这个层级的简历大多两样都没有。", evidence: cite };
EVIDENCE.zh.gaps[0] = { title: "没有能看出上线过的 C++", severity: "material", closable: "before_apply", summary: "它只以技能的形式出现。", howToClose: "今晚就能做，不需要新工作：把 CUDA 核写成经历条目，注明加速倍数和使用方。", evidence: cite };
EVIDENCE.zh.gaps[1] = { title: "没有法规相关经历", severity: "material", closable: "not_before_apply", summary: "这一条这周补不上。", howToClose: "在求职信里直说，并写清你在临床数据流程里确实做过的验证或文档工作。", evidence: cite };
EVIDENCE.zh.risks[0] = { title: "法规工作的范围有多大", severity: "unknown", summary: "职位只提了一次提交，从没说这个岗位是撰写还是配合。", evidence: cite };
EVIDENCE.zh.resumeTailoring[0] = { target: "C++ / CUDA", recommendation: "从技能列表提到经历条目，用招聘方的说法「生产级求解器」。", evidence: cite };
EVIDENCE.zh.interviewFocus[0] = { question: "你是怎么对照临床金标准验证那 28% 的？", rationale: "这是简历里最强的一条，一定会被先追问。", evidence: cite };
EVIDENCE.zh.uncertainties[0] = { type: "团队规模", answeredBy: "employer", message: "目前有多少工程师在做重建，合规文件由谁负责？（在与招聘经理面谈时问）", evidence: cite };
EVIDENCE.zh.uncertainties[1] = { type: "C++ 移植的范围", answeredBy: "you", message: "写清那次移植是否跑在临床环境里、你优化了什么、有没有测试。现在读起来像个副业。", evidence: cite };
const zhAct = ["先确认你在荷兰无需担保即可工作，再决定要不要花这个晚上。", "把 C++/CUDA 那行改写成带加速倍数和使用方的经历条目。", "给重建项目补上时间范围和团队规模。", "投递一周后，通过团队的 LinkedIn 找一次引荐。"];
EVIDENCE.zh.suggestedActions.forEach((a, i) => { a.action = zhAct[i]; });

const css = readFileSync(`${ROOT}/src/sidepanel/sidepanel.css`, "utf8");
const CHROME = { en: ["MarketFit", "Ready", "Senior MRI Reconstruction Engineer · Example Health · Leiden"], zh: ["MarketFit", "就绪", "高级 MRI 重建工程师 · Example Health · 莱顿"] };

for (const locale of ["en", "zh"]) {
  const [title, status, job] = CHROME[locale];
  writeFileSync(`${OUT}/panel-${locale}.html`, `<!doctype html><meta charset="utf-8"><style>
${css}
html,body{margin:0;height:800px;overflow:hidden;background:#e9edef}
.frame{display:flex;height:800px}
.page{flex:1;background:#fff;border-right:1px solid #ced7de;padding:40px 44px;font-family:Inter,system-ui,sans-serif;color:#18232c}
.page h1{font-size:26px;margin:0 0 6px}
.page .sub{color:#596773;font-size:14px;margin-bottom:26px}
.page h2{font-size:15px;margin:22px 0 8px}
.page li,.page p.b{color:#3d4b56;font-size:13.5px;line-height:1.75;margin:0 0 4px}
.page ul{margin:0;padding-left:20px}
.panel-frame{width:400px;background:var(--surface);height:800px;overflow:hidden;padding:14px;display:grid;gap:12px;align-content:start}
.topbar{align-items:center;display:flex;gap:8px;justify-content:space-between}
h1.app{font-size:22px}.version{color:var(--muted);font-size:11px;font-weight:600}
</style>
<div class="frame">
  <div class="page">
    <h1>Senior MRI Reconstruction Engineer</h1>
    <div class="sub">Example Health · Leiden, Netherlands · Full-time</div>
    <h2>About the role</h2>
    <p class="b">You will own the reconstruction pipeline from research prototype through to a cleared clinical product.</p>
    <h2>Requirements</h2>
    <ul><li>Expert PyTorch for deep-learning reconstruction</li><li>Production C++ experience with numerical solvers</li><li>IEC 62304 regulatory submission experience</li><li>Kubernetes experience preferred</li></ul>
    <h2>Responsibilities</h2>
    <ul><li>Take reconstruction models from prototype to a validated clinical release</li><li>Own the C++ inference path and its performance budget</li><li>Work with QA on the software lifecycle file and risk analysis</li><li>Support scanner integration at partner hospitals</li></ul>
    <h2>What we offer</h2>
    <ul><li>EUR 75,000 – 95,000 depending on experience</li><li>Hybrid, three days a week in Leiden</li><li>Conference budget and dedicated research time</li></ul>
    <h2>About us</h2>
    <p class="b">We build clinical imaging software used in 40 hospitals across Europe. International candidates are welcome to apply.</p>
  </div>
  <div class="panel-frame">
    ${process.env.SCROLL ? "" : `<div class="topbar"><div><h1 class="app">${title} <span class="version">v0.7.20</span></h1><p style="color:var(--muted);font-size:12px">${status}</p></div></div>
    <div class="job-summary"><p class="meta">${job}</p></div>`}
    <section class="result" style="margin-top:${process.env.SCROLL || 0}px;overflow:hidden">${renderAnalysisHtml(EVIDENCE[locale], locale)}</section>
  </div>
</div>`);
}
console.log("rendered");
