# 航向 PathFinder · 高中毕业生升学与人生航向规划系统

一个**零依赖、纯静态、可离线安装**的 PWA 应用，把《发现天赋、找到方向》深度研究报告（见 [docs/source-report.md](docs/source-report.md)）中的方法论落地为高考毕业生与家长可以直接上手的工具：

> 把出分前后的两个月，变成"低成本试错 + 系统自我认识"的窗口期。

## 功能总览

| 模块 | 功能 | 对应报告方法论 |
|---|---|---|
| 🏠 首页 | 三阶段行动清单（出分前 / 出分后 / 大学与长期）+ 进度追踪 + 关键调整信号 | 第四章行动建议、Recommendations 1–8 |
| 🎯 测评 | 内置 48 题霍兰德 RIASEC 兴趣自评：六边形雷达图、三字码解读、相邻/对角一致性分析、专业方向建议；外链官方免费工具（阳光志愿、VIA、学职平台、大五人格）与科学性分级说明 | Holland RIASEC、测评工具一览表、批判性视角 1 |
| 🧭 探索 | **心流线索**（5 个天赋信号打卡 + 线索小结）、**成就事件分析**（动机模式）、**奥德赛计划**（三个五年版本：六字标题 / 时间线 / 四仪表盘 / 待解问题）、**生涯人物访谈**（4 个推荐问题 + 访谈记录管理） | 心流理论、SIMA、斯坦福人生设计课、informational interview |
| ⚖️ 决策 | **生涯决策平衡单**：候选"院校+专业"按六维（兴趣/能力/价值观/就业/分数/城市）加权打分、自动综合排序；**冲稳保梯度**归档与填报避坑提醒 | 金树人平衡单、阳光志愿冲稳保、教育部市场预警 |
| 👨‍👩‍👦 更多 | **家长专区**（自主支持 vs 控制型对照、四角色定位、两句关键的话）、**知识库**（20+ 理论卡片）、数据导出/导入/清空、关于与声明 | 自我决定理论、Marcia 早闭警示、全部理论体系 |

## 技术特性

- **PWA**：Service Worker 应用壳缓存，完全离线可用；可"添加到主屏幕"像原生 App 一样使用（含 maskable 图标、快捷方式）。
- **零依赖、零构建**：原生 HTML/CSS/JS，无框架、无打包器、无 npm 依赖，任何静态服务器可直接部署。
- **数据完全本地**：所有记录仅存于浏览器 `localStorage`，无服务器、不收集任何信息；支持 JSON 一键备份与恢复。
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

## 重要声明

- 内置 RIASEC 自评为**简化练习版**，定位是自我探索的起点；正式志愿决策请结合教育部"阳光志愿"等官方测评、真实职业体验与学校老师意见。
- 所有测评结果均为"参考画像"，不构成专业生涯咨询或心理诊断；兴趣会变化，请动态看待。
- 就业"红黄绿牌"等市场信息具有时效性，请以报考当年官方权威数据为准。
