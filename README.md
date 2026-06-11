# 航向 PathFinder · 高中毕业生升学与人生航向规划系统

一个**零依赖、纯静态、可离线安装**的 PWA 应用，把《发现天赋、找到方向》深度研究报告（见 [docs/source-report.md](docs/source-report.md)）中的方法论落地为高考毕业生与家长可以直接上手的工具：

> 把出分前后的两个月，变成"低成本试错 + 系统自我认识"的窗口期。

## 设计理念（v2 · 领航员架构）

> 用户不是来"使用功能"的，是来渡过一段不确定时期的——所以应用的形态是**领航员**，不是工具箱。完整设计逻辑见 [docs/design.md](docs/design.md)。

首次启动用三屏对话定向（考生/家长 × 出分前/已出分/已录取），之后全应用围绕四个标签展开：

| 标签 | 回答的问题 | 内容 | 对应报告方法论 |
|---|---|---|---|
| ⛵ **此刻** | 现在该做什么 | 阶段时间线（点击切换，带确认）、**下一步推荐引擎**（按阶段 × 身份 × 数据状态给 1 主 + 2 次行动卡）、本阶段清单与进度、三个关键调整信号 | 第四章行动建议、Recommendations 1–8 |
| 🧭 **探索** | 我是谁 | 功能导航网格（带完成状态）→ 48 题霍兰德 RIASEC 自评（雷达图 + 三字码 + 一致性分析 + 专业建议）、心流线索与成就动机、奥德赛三种五年、人物访谈；画像速览汇聚强信号；外链官方免费测评与科学性分级 | Holland RIASEC、心流、SIMA、人生设计课、informational interview |
| 🗺️ **决策** | 我去哪里 | 方向池（候选院校+专业）、决策平衡单（六维加权打分 + 综合排序）、冲·稳·保梯度归档、**位次定位**（按位次经验法则给冲稳保参考并一键采纳）与填报避坑提醒 | 金树人平衡单、"用位次而非绝对分"、阳光志愿冲稳保、教育部市场预警 |
| ⋯ **更多** | 其他支持 | 家长专区（自主支持型教养）、知识库（22 张理论卡片）、**选科参考**（6 选 3 定性速查）、身份与阶段设置、数据导出/导入、关于与声明 | 自我决定理论、Marcia 早闭警示、新高考选科背景、全部理论体系 |

测评结果可一键生成**分享图**（端侧 Canvas 渲染，不经服务器）；冲稳保页可导出**打印版志愿表**（A4 / PDF，便于请老师把关）；奥德赛计划自带**三版对比视图**；数据管理支持**备份文件互传**（家长⇄考生设备经 Web Share 发送，对方导入即接收）。

所有输入走**底部浮层、对话式提问**（"什么事让你忘记时间？"），每条记录沉淀到探索页画像/决策方向池。旧版链接（#/assess 等）自动重定向，数据完全兼容。

## 技术特性

- **PWA**：Service Worker 离线可用（导航网络优先 + 4 秒弱网超时回退；静态资源 stale-while-revalidate，部署后自动更新）；可"添加到主屏幕"（含 maskable 图标、快捷方式）；防强制门户缓存污染。
- **零依赖、零构建**：原生 HTML/CSS/JS，无框架、无打包器、无 npm 依赖，任何静态服务器可直接部署。
- **数据完全本地**：所有记录仅存于浏览器 `localStorage`，无服务器、不收集任何信息；JSON 一键备份与恢复，导入数据经过白名单消毒（防注入、防损坏数据导致崩溃）。
- **深色模式**：跟随系统 `prefers-color-scheme`，全套设计令牌双主题。
- **可访问性**：dialog 语义浮层（Esc / 焦点圈定 / 焦点归还）、`aria-expanded` 折叠面板、`:focus-visible` 焦点环、`prefers-reduced-motion` 降级。
- **移动优先**：针对手机竖屏设计，桌面端自适应居中（640px）。

## 本地运行

PWA 需要 HTTP(S) 环境（`localhost` 即可）：

```bash
# 任选其一
python3 -m http.server 8080
npx serve .
```

打开 <http://localhost:8080> 即可。

## 部署

**GitHub Pages 自动部署已配置**：推送到 `main` 分支即触发 [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)，由 GitHub Actions 把仓库根目录发布到：

> https://clarkyu.github.io/PathFinder/

- 工作流首次运行会自动开启本仓库的 Pages（来源：GitHub Actions），无需手动设置；也可在 Actions 页手动触发（workflow_dispatch）。
- 应用全部使用相对路径，天然兼容 `/PathFinder/` 子路径；HTTPS 环境下浏览器会自动提示"安装应用"。

也可部署到任意其他静态托管（Vercel、Netlify、对象存储 + CDN…），直接上传仓库根目录即可。

## 目录结构

```
├── index.html            # 应用壳
├── manifest.webmanifest  # PWA 清单（名称/图标/快捷方式）
├── sw.js                 # Service Worker（离线缓存）
├── css/app.css           # 样式（移动优先）
├── js/
│   ├── data.js           # 内容数据：RIASEC 题库/类型解读、知识库、行动清单……
│   ├── store.js          # localStorage 持久化 + 导入导出
│   └── app.js            # 路由、五大模块视图、测评引擎、SVG 雷达图
├── icons/                # PWA 图标（含 maskable / apple-touch-icon）
├── tools/gen-icons.mjs   # 图标生成脚本（Node 内置 zlib 手写 PNG，零依赖）
└── docs/source-report.md # 方法论依据：原始研究报告
```

重新生成图标：`node tools/gen-icons.mjs`

## 反馈与自迭代（循环工程）

本仓库装配了一套**自反馈迭代系统**（设计全文见 [docs/loop.md](docs/loop.md)）：

```
应用内反馈 → GitHub Issue → Claude 自动分诊 → 维护者批准(loop:approved)
→ Claude 实现 + 补测试 + 开 PR → CI 全绿 → 维护者合并 → 自动部署 → Issue 回访
```

- 用户在应用「更多 → 意见反馈」提交（预填 Issue 或一键复制转交）；
- Claude 通过 GitHub Actions 自动分诊、在批准后实现并开 PR；人只把守**批准**与**合并**两道闸门；
- 启用方法：仓库 Secrets 添加 `ANTHROPIC_API_KEY`（详见 loop.md §7）；
- 红线（隐私零遥测、零运行时依赖、数据消毒不放宽等）写死在 loop.md §5，越线自动转人工。

本地跑测试：`npm install && npm test`（77+ 项 jsdom 冒烟，CI 在每个 PR 上强制执行）。

## 重要声明

- 内置 RIASEC 自评为**简化练习版**，定位是自我探索的起点；正式志愿决策请结合教育部"阳光志愿"等官方测评、真实职业体验与学校老师意见。
- 所有测评结果均为"参考画像"，不构成专业生涯咨询或心理诊断；兴趣会变化，请动态看待。
- 就业"红黄绿牌"等市场信息具有时效性，请以报考当年官方权威数据为准。
