# 循环工程（Loop Engineering）· 自反馈迭代系统

> 目标：让真实用户的反馈**自动**变成分诊、代码、测试与上线回访——
> 人只把守两道闸门：**批准做什么**（加标签）与**批准合并**（Review PR）。

## §0 循环全景

```
 用户                Claude（GitHub Actions）                维护者
 ────                ────────────────────────                ──────
 应用内反馈 ──► GitHub Issue ──► ①自动分诊 ──► 评论+标签 ──► 闸门一：加 loop:approved
                                                  │
        回访评论 ◄── ④上线确认 ◄── 部署(main) ◄── 闸门二：Review & Merge PR
                                                  ▲
                              ②自动实现+自测 ──► ③开 PR（CI 必须全绿）
```

每一圈的产出物：Issue（需求）→ 标签（决策）→ 分支 `loop/issue-N`（实现）→
PR（评审）→ `main` 部署（发布）→ Issue 回帖（回访）→ design.md 迭代记录（沉淀）。

## §1 角色与闸门

| 角色 | 职责 | 权限边界 |
|---|---|---|
| **用户** | 应用内"意见反馈"或直接开 Issue | 只提供信息 |
| **Claude 分诊员** | 判重、分类、定优先级、回帖 | 只读代码，只动 Issue 标签/评论 |
| **Claude 实现者** | 写代码、补测试、开 PR、回访 | 只在 `loop/issue-N` 分支工作，**不能合并** |
| **维护者（人）** | 闸门一：`loop:approved`；闸门二：合并 PR | 唯一能让代码进 `main` 的人 |

两道闸门是系统的安全设计，**不可绕过**：没有 `loop:approved` 不写代码，
没有人工合并不上线。暂停整个系统 = 在 GitHub Actions 页禁用 `Claude Loop` 工作流。

## §2 采集通道

- **应用内**：更多 → 意见反馈。生成结构化文本（类型/描述/版本/环境摘要），
  两条路径：① 预填打开 GitHub Issue（自动带 `feedback` 标签）；
  ② 一键复制（给没有 GitHub 账号的家长/同学，经微信/邮件转交维护者代发）。
- **GitHub 直达**：Issue 模板 `.github/ISSUE_TEMPLATE/feedback.yml`。
- **隐私承诺**：应用无遥测、无埋点。反馈只包含用户亲眼可见并主动提交的内容。
  这是有意的取舍：宁可信号少，不可背着用户收集数据。

## §3 分诊规则（Claude 分诊员执行）

1. **判重**：`gh search issues` 搜关键词；重复 → 评论指向原 Issue + `duplicate`，结束。
2. **分类**（单选）：`type:bug`（行为与预期不符）/ `type:ux`（能用但别扭）/
   `type:feature`（新能力）/ `type:question`（使用疑问，答复后即可关闭）。
3. **优先级**：`priority:p1` 数据丢失、白屏、核心流程不可用；
   `priority:p2` 主要功能缺陷或高频不便；`priority:p3` 其余。
4. **升级 `needs-human`**：触碰 §5 红线、信息不足以复现、或属架构级改动。
5. **回帖模板**：复述理解 → 初步判断与方案方向 → 告知"维护者加
   `loop:approved` 后将自动实现"。语气面向考生与家长，友好、不堆术语。

## §4 实现守则（Claude 实现者执行）

- **分支**：从 `main` 切 `loop/issue-N`，一个 Issue 一个分支一个 PR。
- **最小 diff**：只改与 Issue 相关的代码；顺手重构 = 违规。
- **测试先行**：每个修复/功能必须在 `tests/smoke.mjs` 增加对应断言；
  `npm test` 全绿才允许开 PR（CI 会再次把关）。
- **版本纪律**：`js/data.js` 的 `version` 与 `sw.js` 的 `CACHE` 同步 bump
  （bug 修复 +0.0.1，功能 +0.1.0）；CI 有一致性检查。
- **沉淀**：`docs/design.md` 迭代记录追加一行（动机 + 决策）。
- **设计一致性**：遵守 docs/design.md 的三原则（旅程导向 / 一次一事 /
  输入即沉淀）与「隐喻做氛围、不做路标」的文案规则。

## §5 红线（越线必须 needs-human，禁止自动实现）

1. **隐私承诺**：不得添加任何遥测、埋点、外部上报；数据保持 localStorage 本地。
2. **零运行时依赖**：不引入任何前端运行时库/框架/CDN（devDependencies 仅限测试与工具）。
3. **数据安全**：不得放宽 `store.js` 的 sanitize 消毒；新增字段必须同步新增消毒规则。
4. **不可逆操作**：不改动既有用户数据的语义（迁移必须向后兼容）。
5. **基础设施**：不改部署目标、Pages 配置、本工作流自身的权限与门禁。
6. **内容诚实**：不编造数据（位次、就业率、选科覆盖率等）；引用须可溯源到
   docs/source-report.md 或权威公开来源，并带免责声明。

## §6 验证、回访与度量

- **验证**：PR 检查单（模板内）+ CI（冒烟 + 语法 + 版本一致性）。
- **回访**：PR 合并部署后，在原 Issue 评论"已上线 vX.Y.Z，请更新后验证"；
  报告者确认或 14 天无回复 → 关闭（`@claude 关闭前再确认一次`亦可）。
- **度量**（在 Issue 列表上即可读出，无需额外系统）：
  - 循环周期：Issue 创建 → 关闭的时长；
  - 回归率：合并后 7 天内被 reopen 的比例；
  - 自动化率：无 `needs-human` 即完成的 Issue 占比。

## §7 启用与运维

1. **必需（AI 引擎，二选一）**：仓库 Settings → Secrets and variables → Actions →
   - **国际通道**：新建 `ANTHROPIC_API_KEY`（Claude；两者都配置时默认优先）；
   - **国内通道**：新建 `DEEPSEEK_API_KEY`（DeepSeek V4，2026-04 发布——经其官方
     Anthropic 兼容端点 `https://api.deepseek.com/anthropic` 驱动同一套
     claude-code-action：分诊用 `deepseek-v4-flash`，实现/对话用
     `deepseek-v4-pro`，两者均为 1M 上下文）。
   两把钥匙都没有时工作流会安全跳过并提示；都配置时可在 Variables 设
   `LOOP_PROVIDER=deepseek` 强制走 DeepSeek。每次运行的日志会以
   `::notice::循环引擎：…` 标明实际引擎。
   注：DeepSeek 旧模型名 `deepseek-chat` / `deepseek-reasoner` 将于
   2026-07-24 退役，本配置已使用 V4 系列名称，不受影响。
2. **建议**：Settings → General 把默认分支切到 `main`，并为 `main` 开启
   分支保护（禁止直推）——这是「人工合并」闸门的硬保障，红线不能只靠提示词守。
   **标签必须先存在 `feedback`**（本仓库已创建）：GitHub 的 issue 模板只会
   应用仓库中已存在的标签，不存在的会被静默忽略——若它缺失，模板提交不带
   标签、分诊永不触发（端到端实测踩过的坑）。其余分类标签（type:* /
   priority:* / loop:approved 等）由分诊运行时按需创建，或维护者按分诊
   评论的结论补挂。
3. **触发方式**：分诊只监听「`feedback` 标签被贴上」这一事件——issue 模板
   创建（含应用内链接）会自动带标签；手动开的 issue 由维护者补贴标签即触发。
   注意：GitHub 的 `/issues/new?labels=…` URL 参数只对有仓库权限的用户生效，
   因此应用内链接走 `?template=feedback.yml`（模板标签对任何人生效）。
3. **对话**：任何 Issue/PR 评论里 `@claude ...` 可直接指挥（提问、改方案、修 PR）。
4. **故障模式**：API key 失效 → 工作流警告并跳过，Issue 滞留在 `feedback`
   状态等人工；CI 红 → PR 不可合并；实现者两次尝试仍红 → 自动转 `needs-human`。

## §8 已知局限（诚实清单）

- 无遥测意味着**沉默的大多数不可见**——只能听到主动开口的用户；
- GitHub 账号门槛会过滤掉部分家长用户（复制粘贴通道是补偿，不是解决）；
- 自动实现的质量上限受 Issue 描述质量制约：分诊阶段的追问比代码更重要。
