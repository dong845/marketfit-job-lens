/**
 * Strips page furniture from a captured posting, leaving the job description.
 *
 * The capture falls back to broad containers when a page has no recognisable
 * job-description element, so navigation, cookie banners, "similar jobs" rails,
 * application forms and alert signups arrive alongside the posting. That dilutes
 * the analysis and is paid for by the token.
 *
 * The two mistakes here are not symmetric. Leaving noise in costs tokens and some
 * attention. Removing a real line of the posting changes the answer and says
 * nothing: drop the sentence that says the employer will not sponsor a visa and a
 * weak_fit silently becomes worth_applying. So every rule below is built to be
 * precise about what it removes rather than thorough, three protections outrank
 * all of them, and what was removed is reported rather than discarded quietly.
 */

/** Screening conditions decide the verdict on their own. Nothing may remove them. */
const DECISIVE = /sponsor|visa|work(ing)? (permit|authorization|authorisation)|right to work|eligib|clearance|citizen|security check|licence|license|担保|签证|工作许可|工作签|合法工作|国籍|户口|从业资格|执业/i;

/** Requirement and responsibility vocabulary: the substance of a posting. */
const JD_SIGNAL = /require|must have|responsib|qualification|experience|years?\b|proficient|familiar|expertise|preferred|nice to have|degree|bachelor|master|phd|you will|we offer|salary|compensation|benefit|report(s|ing)? to|team|role|职责|要求|负责|熟悉|精通|经验|优先|学历|本科|硕士|博士|岗位|职位|薪资|待遇|福利|汇报|团队/i;

/**
 * Page controls and chrome. Removed wherever they appear, because none of it is
 * ever part of a posting — but only when the line is short enough to be a control
 * rather than a sentence that happens to mention one of these words.
 */
const FURNITURE = [
  /^(apply|apply now|apply for this job|easy apply|submit( application)?|quick apply)$/i,
  /^(立即(申请|投递|沟通)|投递简历|申请职位|一键投递|马上沟通|在线申请)$/,
  /^(举报(该)?职位|投诉|反馈|该公司其他职位|公司主页|查看公司)$/,
  /back to (jobs|search|results)|view all jobs|all openings|see more jobs|返回(职位|列表|搜索)|查看(全部|更多)职位/i,
  /^(sign in|log ?in|sign up|register|create account)$|^(登录|注册|登入)$/i,
  /cookie|privacy policy|terms of (use|service)|accept all|manage preferences|隐私政策|使用条款|接受全部|同意并继续/i,
  /share (this )?(job|role|posting)|copy link|分享(职位|到)|复制链接|扫码/i,
  /^(save|save job|saved|bookmark)$|^(收藏|已收藏|加入收藏)$/i,
  /create (a )?job alert|create alert|job alerts|get job alerts|subscribe|订阅|职位提醒/i,
  /indicates a required field|required field|attach (a )?(resume|cv)|resume\/cv|dropbox|google drive|autofill|为必填项?/i,
  /(recommended|related|similar|suggested) (jobs|roles|positions)|jobs you may|推荐职位|相似职位|相关职位|你可能(感兴趣|喜欢)/i,
  /skip to (main )?content|跳转到(主要)?内容/i,
  /^©|copyright|all rights reserved|版权所有/i,
  /^[*•·\-–—\s]+$/,
  /^(next|previous|page \d+|more|less|show (more|less))$|^(下一页|上一页|更多|展开|收起)$/i
];

/**
 * Boilerplate long enough to survive the control-length guard.
 *
 * Matched anywhere rather than only after the posting ends: each phrase here is
 * specific enough that no requirement can contain it, and a scam warning sits in
 * the middle of the page as often as at the foot of it. The unconditional guard on
 * screening conditions runs first, so a line that mentions a visa or a citizenship
 * requirement survives these patterns even if it also matches one.
 *
 * The equal-opportunity and self-identification blocks are worth removing for a
 * second reason: they are pages of protected-attribute material, and the system
 * policy forbids the model from reasoning about protected traits at all. Not
 * sending them is better than sending them with an instruction to ignore them.
 */
const BOILERPLATE = [
  /get future opportunities sent|interested in building your career|straight to your email/i,
  /protect yourself from potential scams|recruiters only contact you|never ask for money|谨防诈骗|不会(以任何形式)?收取(任何)?费用/i,
  /equal (employment )?opportunity|affirmative action|voluntary self-identification|protected veteran|disability form|reasonable accommodation|without regard to race/i,
  /we are committed to (diversity|creating an inclusive)|regardless of race, color, religion/i,
  /平等就业机会|不因(种族|性别|民族|宗教|年龄|婚育)|反歧视声明|多元与包容/,
  /本站(所有)?职位(信息)?(均)?由|信息来源于第三方|请勿(轻信|支付)|(谨防|警惕)(虚假|诈骗)/
];

const MAX_JOB_TEXT = 26000;
/** Above this a line is prose, not a button, so the control patterns do not apply. */
const CONTROL_MAX_LENGTH = 60;

/**
 * @returns {{text: string, removedLines: number, removedChars: number, removed: string[]}}
 * `removed` is a sample for the panel to show — over-filtering has to be visible.
 */
export function filterJobText(value) {
  const lines = String(value ?? "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
  // Controls are identified first, because where the posting ENDS has to be measured
  // over real content only. "indicates a required field" contains "required", so
  // counting it as substantive put the end of the posting on the last line of the
  // page and switched off every trailing rule below it.
  const isControl = lines.map((line) => line.length <= CONTROL_MAX_LENGTH && FURNITURE.some((pattern) => pattern.test(line)));
  const lastSubstantive = lastIndex(lines, (line, index) => !isControl[index] && (JD_SIGNAL.test(line) || DECISIVE.test(line)));

  const seen = new Set();
  const kept = [];
  const removed = [];
  lines.forEach((line, index) => {
    if (line.length < 2) return;
    // Repeated lines are navigation echoed around the page, never a posting.
    if (seen.has(line)) return;
    seen.add(line);
    if (isControl[index] || isRemovable(line, index, lastSubstantive)) {
      removed.push(line);
      return;
    }
    kept.push(line);
  });

  const text = kept.join("\n").slice(0, MAX_JOB_TEXT);
  return {
    text,
    removedLines: removed.length,
    removedChars: removed.reduce((total, line) => total + line.length, 0),
    removed: removed.slice(0, 12)
  };
}

function isRemovable(line, index, lastSubstantive) {
  // Three protections, checked before any removal rule.
  // 1. A screening condition decides the application on its own.
  if (DECISIVE.test(line)) return false;
  // 2. Requirement and responsibility content is the posting.
  if (JD_SIGNAL.test(line) && line.length > CONTROL_MAX_LENGTH) return false;
  // 3. Anything before the posting's last substantive line sits inside it; the head
  //    of a page carries the title, location and company introduction, all of which
  //    read like short controls and none of which may be lost.
  const afterPosting = lastSubstantive >= 0 && index > lastSubstantive;

  if (BOILERPLATE.some((pattern) => pattern.test(line))) return true;
  // Long lines matching a control phrase are only furniture once the posting is over
  // — inside it, a sentence mentioning "similar roles" is likely to be about the job.
  if (afterPosting && FURNITURE.some((pattern) => pattern.test(line))) return true;
  return false;
}

function lastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) if (predicate(items[index], index)) return index;
  return -1;
}
