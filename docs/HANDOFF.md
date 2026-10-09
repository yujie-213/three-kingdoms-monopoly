# 当前交接：v1.3.1 骰点标签与操作区无滚动修正

用户指出购买阶段骰点文字与托盘重叠、右侧出现丑陋滚动条。已修正src/ui/game-view.js及tabletop.css：骰点在标题旁清晰显示，费用分行，确认与放弃同排，决策演示压缩，操作区完整布局无需滚动。多块土地的欠款出售改为选择城池后确认，避免长按钮列表，核心规则与存档未改。

最新分享文件releases/三国大富翁-v1.3.1.html（15,657,249字节）；旧版本保留。21项相关Edge浏览器回归与Edge/Chrome2项独立分享验收通过，含经典278轮、40轮、存档和出售确认。新增decisions.spec.js覆盖四尺寸及多土地选择出售；截图docs/art/decision-ui-v1.3.1.png与decision-panel-v1.3.1.png。具体哈希与过程见VALIDATION。临时浏览器配置已移除，本地5173预览继续运行。

以下为历史交接。

# 当前交接：v1.3.0 明亮桌游美术与单HTML分享版

用户已授权实现接近宣传图的明亮可爱桌游美术，并希望最终可直接发送网页文件。已完成v2角色/棋子/建筑/锦囊/标题/骰子托盘美术接入；核心规则未改，v3存档兼容。魏红/蜀黄/吴蓝、玩家表述、无滚动三方概况、更大的记录和骰子区、锦囊说明、立体摇骰/逐格跳跃、具体行为动态提示均保留。

分享文件 `releases/三国大富翁-v1.3.0.html`，15,654,682字节；哈希与验收细节见VALIDATION。仅发送这个HTML即可；接收者下载到电脑后用Edge/Chrome打开，无网络、Node、源码或素材目录要求。两个浏览器都实际自动化断网完成40轮与存档导出/恢复；未在线部署。

源码入口 `src/ui/game-view.js` 与 `src/ui/tabletop.css`；素材在assets，PNG原图与无损WebP均保留，提示词在docs/art/tabletop-assets-v2.md，实际界面截图game-ui-v2.png。scripts/encode-art-lossless.py逐像素验证资源编码一致。新增npm run test:share和playwright.share.config.js，Chrome可设置CHROME_TEST_EXECUTABLE指向便携测试浏览器。默认npm run test:browser新增接收者验收后共18项；本轮原17项覆盖通过，最终UI相关9项与Edge/Chrome分享2项重新通过，70单测通过。测试缓存与便携浏览器缓存均忽略提交与Vite监视。

版本发布文件不会覆盖同版本不同内容；后续游戏修改需提高版本号。收集真实玩家反馈后再调整玩法与经济，未宣称平衡完成。原SVG、旧美术、旧发布版本与原需求包保留。Git仍未提交/推送。

以下为历史交接。

# 当前交接：v1.2.0 地图视觉整理（2026-10-09）

按用户确认实施视觉整理：无主统一米色，魏蓝蜀绿吴红整块占地、阵营旗帜；县城/郡治/名城 × 三级建筑原创SVG；独立设施图、背景山水与四区标签。地图只保留地名，详情点击展开，历史/玩家明细/记录折叠，锦囊图标化，交易现金反馈。生成脚本 `scripts/generate-map-art.js`，新增设施素材 `assets/facilities.svg`。没有更改规则、路线和经济，v1.1存档v3可继续导入。不规则环路尚未实现。

以下为v1.1及更早记录，当前视觉、验收和产物以v1.2为准。

# 当前交接：v1.1.0 魏蜀吴区域地图（2026-10-09）

用户确认扩格与三阵营。40格、29土地、中原/荆襄/江东/巴蜀四段；主将曹操/刘备/孙权，阵营内选角结构已接通。标准1800/500、紧张500/80。矩形地图铺满中央，路径索引独立于坐标，未来可优化不规则环路和地块美术。JSON存档v3，旧v2拒绝且不破坏当前局。

根目录PROJECT_SPEC已更新，原始资料包保留旧规范；MAP_DESIGN记载历史口径、经济依据与来源。新模拟报告simulation-40.json，旧报告不覆盖。当前本地服务仍在5173，浏览器测试需临时复用该服务或先正常停止服务。

以下为v1.0及更早记录，金额、身份、存档版本、产物哈希以新版为准。

# 当前交接：v1.0.0 可离线试玩首版（2026-10-09）

仓库 `D:\GptWork\three-kingdoms-monopoly`，main仍无提交/remote/推送。用户已要求持续完成整个项目，本轮已完成M2–M4与M5本地分发准备；没有删除原始资料包，PROJECT_SPEC根目录与原件仍一致。下方M1/M0内容为历史记录，当前状态以本节为准。

首版功能：24格、刘关张1真人2AI、种子骰点/事件、俸禄、购买一级/落点至多升一级、租金、统一系统/玩家债务、60%出售确认、破产/淘汰、经典与默认40完整轮、12事件/3锦囊、满包决策、免租扣前使用、一次额外骰/跳过计轮、保守激进AI、逐格演出/暂停/三档速度、原创SVG/本地音效/帮助、严格v2JSON存档、结算摘要。

实现文件：`src/core/game.js`（纯dispatcher）、`random.js`、`save.js`；`src/data/board.js`、`events.js`；`src/config/game-config.js`（确认规则、实验配置与校验）；`src/ai/strategy.js`（不接收seed/RNG）；`src/ui/game-view.js`、`styles.css`、`sound.js`；`src/main.js`隔离旧演出/导入异步任务。存档保存MOVING路径、卡/债务决策、RNG、跳过等流程，导入坏文件不修改当前局。

可运行：`npm ci`、`npm run dev`、`npm run check`、`npm run simulate`、`npm run release`、`npm run prepare:pages`。浏览器验收自行启动5173，运行前停止手动开发服务器。Windows默认已安装Edge，LinuxCI使用PlaywrightChromium。

最终收尾已重新启动v1.0试玩服务 `http://127.0.0.1:5173/`（exec会话44807）；旧M1服务已停止。复测前关闭此服务，避免端口冲突。

最终验收：2026-10-09 12:28 Asia/Shanghai，`npm run release`退出0；63单测与8浏览器测试全部通过，实际离线40轮与经典203完整轮后终局。文件 `releases/三国大富翁-v1.0.0.html`59258字节，SHA256 `d393e632ce6a263095679a0ce641552dd7922eb18fbb00dde878af36530d9335`。dist和Pages准备文件完全一致。详见VALIDATION，截图已看，0附属资源请求/0pageerror。

模拟：72样本，60限轮全部完成，6紧张资金经典全部完成、平均197.33轮；6标准经典在2000操作截断，不记胜利。标准1200/300仍默认，可选300/50紧张资金；标准经典可能极长，不能宣称平衡。报告含地块投入/租金、破产原因、首席胜利和胜率。真人实际时长/同学体验尚未测。

分发：M5版本HTML与校验文件已生成；Pages本地index.html已准备，CI与手动Pages工作流已写，未远程执行或上线（无remote/账号，规范可选）。FEEDBACK模板可交同学填写，没有伪造反馈。源码与锁文件应纳入版本控制；生成物、密钥/私人存档/截图被忽略。

普通待定项按DECISIONS可配置默认继续，不是最终产品确认：费用0.75P/1P升级，租金0.15P/0.4P/0.9P，资产现金+实际投入，同分并列；事件有放回，满包替换/放弃。确认规则未改。

限制与维护：仅本机Edge自动化file://，非人工双击/其他浏览器/手机验收；提示音API已触发但未人工听音；JSON仅本版v2，没有跨版本迁移；历史日志最多5000条（避免经典长局内存增长），不能宣称保存完整命令历史。更细美术、移动端与平衡继续根据真实反馈迭代。

下一条维护任务：收集一次真实同学反馈，按FEEDBACK复现步骤与JSON存档加回归，再修复/调参并提升版本。`releases`同版本不同内容拒绝覆盖，发布后修改游戏必须升版本。

## M1 历史交接（已由上方v1.0替代）

仓库 `D:\GptWork\three-kingdoms-monopoly`，分支 main，仍无提交/remote/推送。全部 M0 文件保留，旧占位组件不再从入口引用。权威规范未改。

已实现：24 格占位环路、刘关张任选真人、两名基础 AI、种子 RNG、角色/阶段/revision 校验、一次移动一次落点结算、过起点俸禄、购入一级、独立落点升级、收租、最小欠租出售/破产、40 完整轮结算、重开。AI 不接收 RNG，真人/AI 共用 dispatch。速度仅改变控制器等待，新局代号防止旧定时器污染。

未实现：经典模式、通用系统债务、事件/锦囊、JSON 存档、美术/音效、部署。M1 的最小债务是保证闭环的 M2 基础子集，M2 未完成。

费用默认及歧义见 DECISIONS：升级 0.75P / 1.00P，租金 0.15P / 0.40P / 0.90P，总资产现金+实际投入、同分并列；均未最终确认。

核心入口 `src/core/game.js`、RNG `src/core/random.js`、地图 `src/data/board.js`、AI `src/ai/strategy.js`、DOM `src/ui/game-view.js`、控制器 `src/main.js`。命令仍为 `npm run dev` / `npm run check` / `npm run build`，浏览器要求本机 Edge，产物 `dist/三国大富翁.html`。

最终验收（11:52，Asia/Shanghai）：`npm run check` 退出码 0；30 项 Vitest 测试（419ms），4 项 Edge 测试通过；单 HTML 20049 字节，构建 172ms，资源检查通过。离线 1366×768 / 1920×1080 启动与掷骰、刷新正常；额外通过页面按钮完成种子“完整局”的 40 完整轮，并切换真人张飞重开验证资金恢复。0 附属资源请求、0 pageerror。已查看离线页面与完整结算截图，地图显示所有者文字和建筑级别，关键操作未遮挡（页面可滚动）。

收尾后保留了试玩开发服务器：`http://127.0.0.1:5173/`（exec 会话 66862）。后续运行浏览器测试前先停止此服务，否则 Playwright 会按配置拒绝复用占用的端口；本轮测试阶段服务均由 Playwright 自行启停。

截图：`test-results/m0-offline-human-AI-comple-19264-hen-starts-a-clean-new-game/completed-40-rounds.png`；m0 文件名延续原自动化文件，仅测试内容已升级 M1。结算该种子结果：张飞 3079、刘备 2838、关羽 2183 金总资产。这是一次验证，不能宣称已经平衡。

布局允许页面滚动；无精致美术、逐格行走动画或弹出模态窗，决策使用侧边显式确认面板。自动化 headless file:// 并非人工文件管理器双击；只测本机 Edge。重新开始与刷新会丢失当前局，当前没有保存功能。

下一小任务：统一系统/玩家付款债务入口并补边界测试，再做经典模式和版本化 JSON 存档（M2）。

## M0 历史交接（以下当前描述已由上方 M1 更新替代）

仓库：`D:\GptWork\three-kingdoms-monopoly`。

先读根目录 `PROJECT_SPEC.md` 全文、本文件、`docs/DECISIONS.md`，再看 `git status` 和测试。初始目录只有资料包且无 Git；本次新建 `main`，无提交（HEAD 未出生）、无 remote、无推送。原始三个资料文件原样保留；根目录规范为同内容副本。

当前仅工程占位页，没有游戏状态机、骰子、地图、土地、债务、AI、事件、存档或排名实现。空目录通过 `.gitkeep` 保留。

## 可运行命令

```powershell
npm ci
npm run dev
npm test
npm run build
npm run test:browser
npm run check
```

产物：`D:\GptWork\three-kingdoms-monopoly\dist\三国大富翁.html`。

核心文件：`vite.config.js`、`scripts/single-html-plugin.js`、`scripts/guard-output.js`、`scripts/release-validation.js`、`scripts/verify-release.js`、`tests/unit/release-validation.test.js`、`tests/browser/m0.spec.js`、`src/config/game-config.js`、`src/ui/placeholder.js`。

## 验证记录

最终验收：2026-10-09 11:37（Asia/Shanghai），`npm run check` 退出码 0。

| 项目 | 实际结果 |
|---|---|
| Node / npm | 24.21.0 / 11.19.0 |
| Vite / Vitest / Playwright / parse5 | 7.3.7 / 4.1.11 / 1.64.0 / 8.0.1 |
| `npm test` | 1 文件，9 项通过；318ms；测试发布依赖检查，不是游戏规则 |
| `npm run build` | 成功，82ms；dist 仅 `三国大富翁.html`，2339 字节；JS/CSS 内联，资源引用检查通过 |
| 开发浏览器测试 | Vite 127.0.0.1:5173 页面启动、标题可见、按钮与 CSS 正常，无 pageerror |
| 离线浏览器测试 | 本机 Edge 154.0.4258.62 headless；1366×768、1920×1080 两项通过 |
| file:// 条件 | `context.setOffline(true)` 后打开本地 HTML，再刷新；两次按钮响应及 CSS 均通过 |
| 网络与错误记录 | 每项只记录到 2 次同一个 file:// HTML 主文档请求，0 附属请求、0 pageerror |
| 浏览器汇总 | 3 项通过，4.6s；按钮在视口范围内 |

截图：`test-results/m0-offline-file-standalone-HTML-at-1366x768/offline.png`、`test-results/m0-offline-file-standalone-HTML-at-1920x1080/offline.png`（本地证据，不提交）。没有进行人工文件管理器双击，已实际验证同一文件的离线浏览器 file:// 导航。

首次沙箱执行 Vite/esbuild 时报子进程 `spawn EPERM`，经工具权限提升后可运行；这属于本次执行环境限制。首次插件产物包含 modulePreload 的 fetch，被发布检查拒绝，已改本地插件、IIFE 和关闭预加载。首次本地插件把经典脚本放在 head，导致 DOM 未准备好，离线测试失败；修正为 body 末尾执行后，上述最终复测全部通过。

安装时发现原单文件插件链 3 项 high，已移除；移除后的 npm 安装审计为 0 vulnerabilities。未使用 `npm audit fix --force`。锁文件应纳入版本控制，依赖/缓存不提交；本次尚未执行任何 Git 提交。

根目录与原始资料包 `PROJECT_SPEC.md` SHA256 相同：`40519078B4CB16D9392A59A19AE05819714CAEB03B8EF1C4EB4DB643F47E227E`。

浏览器测试自行启动/停止 Vite，默认占用 5173；若有既有服务则拒绝复用以避免测错项目。Edge 必须已安装；其他浏览器可用 BROWSER_CHANNEL 显式指定。截图在 `test-results/`（忽略提交）。

## 已知边界与下一条任务

- 当前版本不能玩一局；未验证完整 40 轮、交易、债务、存档、AI 或游戏平衡。
- 无图片/音效，未来素材需源码导入并在发布时持续检查。
- 只测本机 Edge；未测 Chrome、Firefox、其他 Windows 版本或手机。未部署 GitHub Pages。
- 升级/租金表格和限轮平局存在歧义，见 DECISIONS；不能擅自确认。
- 自动化 headless file:// 验证与实际人工双击是不同操作，结果要区分记录。

**M1 第一小任务（下一次明确授权后）：**实现 `src/core` 初始状态工厂与显式阶段定义，RNG 可注入；新增“三名角色共同起点、同现金、开局不发俸禄”的测试。保持 core 不引用 DOM/动画，只做这个小任务再继续迭代。

本轮完成 M0 后停止。
