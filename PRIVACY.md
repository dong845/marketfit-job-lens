# Privacy Policy — MarketFit Job Lens

Last updated: 2026-07-26

## Summary

MarketFit Job Lens has no backend. There is no MarketFit server, no account, no
analytics, and no telemetry. Nothing is transmitted anywhere until you click
**Analyze current job with AI**, and when you do, it goes directly from your browser
to the AI provider you selected — and to no one else.

## What the extension handles

**Your CV.** You choose a PDF. It is parsed inside your browser using a bundled copy
of Mozilla's pdf.js. The file itself is never uploaded. The extracted text stays in
the memory of the open side panel.

**The job posting.** After you click Analyze, the extension reads the visible content
of the tab you are looking at, once, using the `activeTab` permission. It does not
read pages in the background, does not read other tabs, and does not track browsing
history. Navigation, cookie banners, similar-job rails and application forms are
filtered out before anything is sent; the panel shows how many lines were removed.

**Your API key.** You paste a key for the provider you chose. It is held in the
memory of the open panel, sent only as the authorisation header of the analysis
request, and never written to storage. Closing the panel discards it.

**Your work-authorization selection.** A category you pick from a menu. It is sent
with the analysis so the employer's stated conditions can be compared against it.

## What is sent, and to whom

When — and only when — you click Analyze, the extension sends the text of your CV,
the filtered text of the job posting, and your work-authorization selection directly
to the one provider you chose:

| Provider | Endpoint | Their policy |
| --- | --- | --- |
| OpenAI | `api.openai.com` | https://openai.com/policies/privacy-policy |
| Anthropic | `api.anthropic.com` | https://www.anthropic.com/legal/privacy |
| DeepSeek | `api.deepseek.com` | https://platform.deepseek.com |

Your data is then subject to that provider's policy and to the terms of your own
account with them. The extension has no other network destinations. Chrome asks for
permission to reach a provider's domain at the moment you select it, and for
permission to read a site the first time you analyse a page on it.

**Nothing is sold, shared with anyone else, or used for advertising, and no
information is used to train any model by this extension.** Whether a provider
trains on API traffic is governed by your account settings with that provider.

## What is stored on your device

| Stored | Where | Why |
| --- | --- | --- |
| Interface language | `chrome.storage.local` | Remember English or 中文 |
| How long past analyses took | `chrome.storage.local` | Show a realistic progress estimate |
| Past reports | `chrome.storage.session` | Reopen the full report during this browser session |

Reports are kept for the current browser session only and **contain no CV text** —
the quoted source passages are stripped before storage. Your PDF, its extracted
text, and your API key are never written to storage of any kind.

**Clear local session** in the panel removes the in-memory CV, job, result and API
key, and deletes every stored report. Uninstalling the extension removes everything
else.

## Permissions and why each exists

| Permission | Why |
| --- | --- |
| `activeTab` | Read the job page you are looking at, once, after you click Analyze |
| `scripting` | Run that one-time extractor in that tab |
| `tabs` | Tell whether the captured job still matches the tab you are on |
| `storage` | Interface language, timing estimates, and session reports |
| `sidePanel` | Show the workspace |
| `https://*/*` (optional) | Requested per site, at the moment you analyse a page on it — never at install |

No permission is granted at install time beyond the five above. The extension
requests no host permissions up front, executes no remote code, and bundles every
dependency it uses.

## Children

The extension is not directed at children and does not knowingly handle data from
anyone under 16.

## Changes

Material changes will be published in this file, with the date above updated. The
version of this policy that applies is the one published alongside the extension
version you have installed.

## Contact

Open an issue at https://github.com/dong845/marketfit-job-lens/issues

---

# 隐私政策 — MarketFit Job Lens

最后更新：2026-07-26

## 概要

MarketFit Job Lens **没有后端**。没有 MarketFit 服务器，没有账号，没有埋点，没有统计。
在你点击**「用 AI 分析当前职位」**之前，不会有任何数据离开你的浏览器；点击之后，数据
从你的浏览器**直接**发送给你选定的那一家 AI 服务，不经过任何其他方。

## 扩展会接触到什么

**你的简历。** 你选择一个 PDF，它由内置的 Mozilla pdf.js 在你的浏览器内解析。**文件本身
从不上传**，提取出的文字只保留在打开着的侧边栏内存中。

**职位页面。** 在你点击分析之后，扩展通过 `activeTab` 权限**一次性**读取你正在看的那个
标签页的可见内容。它不在后台读取页面，不读取其他标签页，不记录浏览历史。导航栏、Cookie
横幅、相似职位栏和申请表单会在发送前被滤掉，侧边栏会显示滤除了多少行。

**你的 API Key。** 你粘贴所选服务的 Key。它只保留在打开着的侧边栏内存中，仅作为分析请求
的授权头发送，**从不写入任何存储**。关闭侧边栏即丢弃。

**你选择的工作授权状态。** 一个从菜单里选的类别，随分析一起发送，用于和雇主写明的条件做
对照。

## 发送什么、发给谁

**仅当**你点击分析时，扩展会把简历文字、过滤后的职位文字、以及你选择的工作授权状态，
**直接发送给你选定的那一家服务**：

| 服务 | 接口地址 | 其隐私政策 |
| --- | --- | --- |
| OpenAI | `api.openai.com` | https://openai.com/policies/privacy-policy |
| Anthropic | `api.anthropic.com` | https://www.anthropic.com/legal/privacy |
| DeepSeek | `api.deepseek.com` | https://platform.deepseek.com |

此后你的数据受该服务的隐私政策，以及你与它之间账户条款的约束。扩展没有任何其他网络目的地。
选择某家服务时 Chrome 会询问是否允许访问其域名；首次分析某个网站上的页面时，会询问是否
允许读取该网站。

**不出售、不共享给任何第三方、不用于广告，本扩展也不会用你的任何信息训练任何模型。**
所选服务是否会用 API 流量训练模型，取决于你在该服务的账户设置。

## 本机保存什么

| 保存内容 | 位置 | 用途 |
| --- | --- | --- |
| 界面语言 | `chrome.storage.local` | 记住中文或 English |
| 历次分析耗时 | `chrome.storage.local` | 给出贴近实际的进度预估 |
| 历史报告 | `chrome.storage.session` | 在本次浏览器会话内重新打开完整报告 |

报告只在**当前浏览器会话**内保留，且**不含任何简历原文**——引用的源文本在存储前已被剥除。
你的 PDF、它的提取文字、以及 API Key **从不写入任何形式的存储**。

侧边栏的**「清除本地会话」**会清掉内存中的简历、职位、分析结果和 API Key，并删除所有已存
报告。卸载扩展会清除其余全部内容。

## 各项权限的用途

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 在你点击分析后，一次性读取你正在看的职位页面 |
| `scripting` | 在该标签页运行那一次性的提取脚本 |
| `tabs` | 判断已抓取的职位是否仍与当前标签页一致 |
| `storage` | 界面语言、耗时预估、会话内报告 |
| `sidePanel` | 显示侧边栏工作区 |
| `https://*/*`（可选） | 按网站单独请求，且只在你要分析该网站页面的那一刻——**安装时不请求** |

安装时除上述五项外不授予任何权限。扩展不预先请求任何主机权限，不执行远程代码，所有依赖
均已内置。

## 未成年人

本扩展并非面向儿童设计，也不会有意处理 16 岁以下人士的数据。

## 变更

实质性变更会更新到本文件并同步上方日期。对你适用的版本，是与你所安装扩展版本一同发布的
那一版。

## 联系方式

在 https://github.com/dong845/marketfit-job-lens/issues 提交 issue
