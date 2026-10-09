# 三国大富翁

原生 HTML/CSS/JavaScript + Vite，无后端。**v1.3.1 明亮桌游美术版**：40 格区域环路、魏蜀吴（曹操 / 刘备 / 孙权）、1 玩家 + 2 AI、土地经营、债务与破产、双模式、12 种事件、3 种锦囊、JSON 存档。界面采用金色标题、Q版人物肖像与全身棋子、分级建筑、木托盘、立体摇骰和逐格跳跃，并用自动提示说明使用锦囊、购地、升级及谁向谁支付过路费。

权威需求：[PROJECT_SPEC.md](PROJECT_SPEC.md)。原始资料包保留在 `three_kingdoms_monopoly_docs/`；根目录规范已按用户最新要求更新；原始资料包保留旧版基线，后续以根目录规范为唯一维护入口，不并行修改两份。

## 安装、开发、验证

要求 Node.js >=22.12（本次使用 24.21.0）、npm；浏览器自动测试默认使用 Windows 已安装的 Microsoft Edge。

```powershell
npm ci
npm run dev
```

打开终端显示的本地地址，通常为 `http://127.0.0.1:5173`。点击顶部“新局设置”，选择玩家阵营、模式、经济预设和种子后开始；掷骰，购买/升级可确认或放弃，结束回合后 AI 自动行动。桌面采用三栏布局：左侧玩家与记录、中央棋盘、右侧操作与土地详情；棋盘随窗口尺寸缩放，主要信息在一屏内展示，无主地为米色，魏红 / 蜀黄 / 吴蓝表示占地，并配阵营旗帜；设施采用独立图形。三方角色概况同时可见且没有滚动条，对局记录默认展开并有独立滚动区；骰点显示在操作标题旁的浅底标签中，购买/升级费用分行排列，确认与放弃同排，操作区无需滚动；角色明细与较长土地详情按需展开。鼠标悬停或键盘聚焦锦囊可查看效果。普通/快速/跳过等待只改变演出时间，暂停会锁定行动。开发页面会加载 Vite 本地模块/HMR，这是开发工具行为。

```powershell
npm test                # Vitest 游戏核心 + 发布依赖检测
npm run build           # 单 HTML 构建 + 强制资源检查
npm run verify:release  # 单独复查已有产物
npm run test:browser    # 先构建，再运行：开发页 + 离线 file:// Edge
npm run test:share      # 先构建：空文件夹中的单 HTML，Edge + Chrome 断网对局/存档
npm run check           # 顺序执行上述测试、构建、浏览器测试
npm run simulate        # 72 个种子样本，写入 docs/reports/simulation-40.json
npm run release         # 全部验收后生成带版本号的 HTML + SHA256
npm run prepare:pages   # 仅准备 pages-artifact/index.html，不上传
```

浏览器测试自行启动/停止 5173 端口的开发服务；运行前停止已开的 `npm run dev`。Windows 默认使用本机 Edge；若有 Chrome，可设置 `$env:BROWSER_CHANNEL='chrome'` 重跑。`test:share` 使用已安装的 Edge 与 Chrome，也可设置 `$env:CHROME_TEST_EXECUTABLE` 指向便携 Chrome 测试版。本次使用 Edge 154.0.4258.62 和 Google 官方 Chrome for Testing 155.0.8059.39 验证。Linux CI 配置使用 Playwright Chromium（需 `npx playwright install --with-deps chromium`）；该远程流程尚未执行。普通开发无需 Playwright。

## 发布与离线打开

构建命令为 `npm run build`。确切产物：

```text
D:\GptWork\three-kingdoms-monopoly\dist\三国大富翁.html
```

带版本号的分享文件：`D:\GptWork\three-kingdoms-monopoly\releases\三国大富翁-v1.3.1.html`，约 15.7 MB。旁边的 `.sha256` 用于校验，分享时只需发送 HTML。`npm run release` 不覆盖同版本的不同内容，修改后需提升版本号。

把上述 HTML 作为文件发送给朋友。接收者下载到电脑后，双击或拖入 Edge / Chrome 即可开始；如果聊天软件只显示代码或预览，请先下载文件，再用浏览器打开。玩家无需 Node、服务器、素材文件夹或网络。现金不足先卖地筹款（需再次确认），资产仍不足才破产。限轮在完整 40 轮后结算；经典在只剩一名存活者时结束。

`file://` 自动测试禁用网络，检查资源请求和页面错误；覆盖四个 PC 尺寸、完整 40 轮和经典对局、存档、免租、出售确认、速度切换及重开。另将 HTML 单独复制到临时空目录，在 Edge 与 Chrome 中离线完成40轮，再导出并恢复终局存档，确认接收者无需源码或素材目录。具体结果见 [docs/VALIDATION.md](docs/VALIDATION.md)。本版面向电脑浏览器。

## 玩家操作与数值

空城计在敌地扣租前询问；千里走单骑在掷骰前 +2 格；生财有道在掷骰前 +100 金。最多持有三张，满时可替换或放弃新锦囊。土地详情可悬停/点击查看，建筑级别与所有者有文字标识。结束页分列现金、购地价值、升级投入、回收价值、总资产、圈数与关键事件摘要。

标准经济：初始 1800 / 圈俸禄 500 金；紧张资金：500 / 80 金。两种预设对所有角色相同。经典标准经济可能持续很久，建议试玩紧张资金；不会偷偷增加轮数上限。费用与估值是实验参数，详见 DECISIONS，尚未宣称游戏已经平衡。

## 保存与恢复

随时点击“导出存档”下载 JSON，包含版本、玩家、轮数、土地、锦囊、RNG 和当前流程。可保存移动中、购买/升级、欠款或锦囊决策。导入先校验，再显示替换确认；取消继续原局，坏文件不会破坏当前局。支持本版格式 v3；旧版24格存档无法直接恢复，导入时明确拒绝且不影响当前局。

刷新会重新开局，不自动保存、不依赖 localStorage。重要对局先导出；保存文件由玩家自己保管。本版仅 PC 单机，无联机、账号或后端。

JS、CSS 与所有运行图片全部内联；使用系统字体和本地 Web Audio 合成提示音（默认关闭，点击开启）。美术原始 PNG 保留，网页使用逐像素验证一致的无损 WebP。素材来源与提示词见 [assets/LICENSE.md](assets/LICENSE.md) 和 [v2 美术记录](docs/art/tabletop-assets-v2.md)。不使用 CDN、API、追踪或在线素材。新增素材必须源码导入，不用 public/。未内联资源会导致构建失败；HTML/CSS 与 JS AST 检查结合离线浏览器请求记录验证发布链路。

`dist` 属于可再生成产物。构建不会自动清空该目录；若里面有非本工程生成的文件则拒绝构建，需人工移走后重试。

## 目录与边界

```text
src/core/    纯状态转换、动作校验、轮次、资产、系统/玩家债务、RNG、存档
src/config/  已确认约束与待确认实验默认值分开保存
src/data/    40 格地图、四区域、三阵营角色注册表、12 种事件与3种锦囊
src/ai/      不含种子/RNG 的公开视图与保守/激进决策，共用 dispatch
src/ui/      地图、Q版肖像、决策、日志、结算、演出与提示音
src/main.js  入口连接层
assets/      生成的桌游美术PNG与无损WebP、原始SVG及素材说明
scripts/     单文件构建、验证、模拟、版本发布和Pages产物准备
tests/       unit/规则/存档/发布检查，browser/真实离线操作
docs/        规则、决策、任务、交接
```

core 接收状态和合法指令，返回新状态及事件日志，不访问 DOM 或动画计时。UI 发送意图，AI 使用同一入口且看不到 RNG。角色/阶段/revision 校验拒绝重复结算；控制器的局代号和调度版本取消旧演出与导入异步任务。移动动画不消耗随机数，逻辑落点只结算一次。

## Git 与维护

初始无 Git 仓库，M0 新建 `main`，没有提交、remote 或推送。保留全部原始资料文件。`.gitignore` 排除依赖、构建、缓存、测试报告、密钥和本地存档；提交源码、文档与 `package-lock.json`，不要提交 `.env` 或凭据。示例环境文件只能含假值。`.gitignore` 不能防止已跟踪文件泄密，提交前仍需检查 `git diff --cached`。

源码与自动生成发布文件分开：`dist/`、`releases/`、`pages-artifact/`、缓存、测试截图与私人存档忽略提交。接力见 [docs/HANDOFF.md](docs/HANDOFF.md)。

GitHub Pages 准备见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)，当前未部署；同学试玩表见 [docs/FEEDBACK.md](docs/FEEDBACK.md)。真实反馈尚未收集，手机版仍是后续范围。
