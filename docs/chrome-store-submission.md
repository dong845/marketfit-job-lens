# Chrome Web Store submission

Everything the dashboard asks for, written out. Copy each block into the matching
field. What only you can do is marked **[you]** — a developer account and a payment
cannot be made on your behalf.

---

## Before you start **[you]**

1. **Register a developer account** at https://chrome.google.com/webstore/devconsole
   — one-time US$5, paid with your own card. Nobody can do this on your behalf.
2. **Host the privacy policy at a public URL.** The store requires one, and the
   reviewer must be able to open it. `PRIVACY.md` is written and in the repo, but
   **the repo is private**, so a link to it will 404 for the reviewer. Either make
   the repo public, or publish the file somewhere reachable (GitHub Pages on a
   public repo, a Gist, or any static host).
3. ~~Take screenshots.~~ **Done** — four 1280×800 PNGs in `docs/store-screenshots/`,
   two per language: the verdict view, and the requirements-and-actions view.

   They are built from the shipping renderer and stylesheet with **invented data**,
   by `scripts/build-store-screenshots.mjs`. That is deliberate on two counts: a
   screenshot of a real run would publish your own CV — name, employers, dates — to
   everyone who opens the listing, and a hand-captured image goes stale the moment
   the panel changes. Regenerate rather than re-crop.

   Upload the two English ones under the English listing and the two Chinese ones
   under 中文.

---

## Listing

**Category:** Productivity
**Language:** English (add 中文 as a second locale — the extension ships both)

### Short description (132 max — currently 112)

```
Analyse the job page you are on against your CV, with every strength, gap, and next step quoted from the source.
```

### Detailed description

```
MarketFit Job Lens reads the job posting in your current tab, compares it against
your PDF CV, and answers one question: is this worth an evening?

THE DECISION, FIRST
A verdict — apply, worth applying, fix gaps first, probably skip — with the count
behind it (4 required areas · 1 evidenced · 1 partial · 2 missing), what applying
would cost you (half an hour of edits, one evening, more), and the single change
that would most move the application.

SCREENING SEPARATED FROM WISHLIST
Postings write "required" on every line. A knockout is what a recruiter can check
without judgement and that ends the application on its own — a licence, a clearance,
a right-to-work condition. Everything else is weighted, and the verdict follows the
knockouts rather than a box count.

THE EMPLOYER'S OWN CONDITIONS, QUOTED
A sponsorship line decides an application before fit does, so it sits directly under
the verdict — with the one question whose answer settles it, written as a sentence
you can send. Where a condition conflicts with the work authorization you selected,
the verdict is lowered and the card says why.

A PLAN, NOT A LIST
Actions grouped by when to do them and numbered. What to ask the employer, and
separately, what your own CV leaves unanswered — a role listed with no detail is
something only you can fix.

TAILORING THAT STAYS HONEST
It reorders and sharpens evidence your CV already contains. It will not add a skill,
upgrade "contributed to" into "led", restate a team result as yours, or supply a
number you did not.

WHAT IT DELIBERATELY DOES NOT DO
No immigration advice — no visa routes, quotas or processing times. It reports what
the employer wrote and leaves you to verify it. No interview odds. No invented
evidence: every claim cites your CV or the posting, and references that do not
resolve are dropped rather than shown.

PRIVACY
No backend, no account, no analytics. Your PDF is parsed in your browser and never
uploaded. Nothing is transmitted until you click Analyze, and then it goes directly
to the one AI provider you chose. Your API key stays in the open panel and is never
stored.

BRING YOUR OWN API KEY
Works with OpenAI, Anthropic, or DeepSeek. You supply a key for the provider you
pick; usage is billed by them to your own account. A key on an account with no
credit will fail on the first call — top up first.

English and 中文 throughout.
```

### 中文 listing

```
MarketFit Job Lens 读取你当前标签页里的职位描述，和你的 PDF 简历逐条对照，回答一个
问题：这份工作值不值得你花一个晚上去投。

先给结论
可以直接投 / 值得投递 / 补齐后再投 / 建议先跳过，并附上支撑它的计数（4 项必需要求 ·
1 项有证据 · 1 项部分满足 · 2 项缺失）、投递需要付出的成本，以及最能改变结论的那一件事。

把「筛人的」和「许愿单」分开
职位描述几乎每行都写着「必须」。真正的硬性门槛是招聘方不需要判断就能核对、且单独一条
就能结束申请的东西。结论跟着硬性门槛走，而不是数勾了几个框。

雇主写明的条件，原样引出来
一句「不提供签证担保」在匹配度之前就决定了这次申请，所以它紧贴结论下方——并附上一句
你可以直接发出去的、能问出结果的问题。当条件与你选择的工作授权状态冲突时，结论会被
下调，并写明原因。

给的是计划，不是清单
行动按时机分组并编号。「你该问他们什么」与「你的简历没说清楚的地方」分开——后者只有
你自己能补。

简历优化保持诚实
只重组和锐化简历里已有的证据，不会替你添加技能、不会把「参与」升级成「主导」、不会把
团队成果写成个人的，也不会编一个你没有的数字。

刻意不做的事
不给移民建议，不讲签证路径、配额或办理时长；只报告雇主写了什么，剩下的留给你核实。
不预测面试结果。不编造证据。

隐私
没有后端、没有账号、没有埋点。PDF 在你的浏览器里解析，从不上传。点击分析之前不发送
任何内容，之后只发给你选定的那一家服务。API Key 只留在打开着的侧栏里，从不保存。

需自备 API Key
支持 OpenAI、Anthropic、DeepSeek，用量由对方按你的账户计费。新建的 Key 若账户没有
余额，第一次调用就会失败，请先充值。

界面与分析均支持中文与 English。
```

---

## Permission justifications

The dashboard asks for one per permission. Vague answers are the most common cause
of a stalled review.

| Field | Answer |
| --- | --- |
| `activeTab` | Reads the visible content of the tab the user is looking at, once, after the user clicks Analyze, so the job posting can be compared with their CV. It is never used in the background. |
| `scripting` | Injects the one-time extractor that collects that visible text. No remote code: the injected function is part of the bundled package. |
| `tabs` | Compares the URL of the captured job with the active tab, so the panel can tell the user their analysis belongs to a different page than the one they are now viewing. |
| `storage` | Stores the interface language, how long past analyses took (to show a realistic progress estimate), and reports for the current browser session. No CV text and no API key is ever stored. |
| `sidePanel` | The entire user interface is a side panel. |
| `https://*/*` (optional) | Requested per site at the moment the user analyses a page on it, never at install. The extension cannot know in advance which job board the user will visit, so the pattern is broad while the grant is per-origin and user-initiated. |
| Remote code | None. Every dependency, including the PDF runtime, is bundled in the package. |

## Data-use disclosures

Answer the Privacy Practices tab truthfully:

- **Personally identifiable information** — YES. The CV text the user selects is sent
  to the AI provider they choose.
- **Website content** — YES. The visible text of the job page the user asks to analyse.
- **Authentication information** — YES. The API key the user pastes is sent to that
  provider as an authorisation header. It is never stored.
- Health, financial, personal communications, location, web history, user activity — NO.
- **Not sold to third parties** — certify.
- **Not used or transferred for purposes unrelated to the single purpose** — certify.
- **Not used to determine creditworthiness or for lending** — certify.

**Single purpose statement:**

```
Compare the job posting in the user's current tab against their own CV and tell them
whether it is worth applying to, and what to do before they do.
```

---

## Known review risks

Honest about what may come back.

1. **The broad optional host pattern.** `https://*/*` is the widest thing requested.
   It is optional and granted per origin at the user's initiative, which is the
   pattern reviewers ask for, but expect a question. The justification above is the
   answer. `http://*/*` was removed for this reason — no real job board needs it.
2. **Bring-your-own-key.** Unusual, and can read as incomplete. The listing says it
   plainly so a reviewer is not surprised.
3. **Anthropic is not verified end to end.** Direct browser access was fixed and
   confirmed against the live CORS preflight, but a full analysis has never been run
   against that endpoint. Shipping a provider option to the public that has never
   completed once is a real quality risk — **run one Anthropic analysis before
   submitting**, or remove Anthropic from the dropdown for the first release.
4. **No screenshots yet.** A blocking requirement.

## Release checklist

- [ ] `npm run check` green on the release commit
- [ ] Version bumped in both `manifest.json` and `package.json`
- [ ] One successful analysis per provider offered in the dropdown
- [ ] Clear local session verified in a fresh Chrome profile
- [ ] Text-based, password-protected, image-only and oversized PDFs all handled
- [ ] Capture tried on a JSON-LD board, a Greenhouse/Lever page, and a noisy aggregator
- [ ] Keyboard and focus pass over the panel; both languages read end to end
- [ ] Privacy policy live at a public URL, and that URL in the dashboard
- [ ] Screenshots taken at 1280×800
