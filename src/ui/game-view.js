import { currentPlayer, Phase, landPrice, rent, upgradeCost, assets, canUpgrade, cityGroup, groupIncome, prosperityMultiplier, cashReserve, disposalOptions, demolitionValue, canShop, shopPrice } from '../core/game.js';
import { battleReportMarkup } from './battle-report.js';
import { characters, factions, regions, cellCoordinates, boardLayout } from '../data/board.js';
import { cards } from '../data/events.js';
import portraitArt from '../../assets/tabletop-portraits-v2.webp?inline';
import pawnArt from '../../assets/tabletop-pawns-v2.webp?inline';
import buildingArt from '../../assets/tabletop-buildings-v2.webp?inline';
import sceneArt from '../../assets/tabletop-map-v1.webp?inline';
import facilityArt from '../../assets/tabletop-props-v1.webp?inline';
import cardArt from '../../assets/tabletop-cards-v2.webp?inline';
import diceStageArt from '../../assets/tabletop-dice-stage-v2.webp?inline';
import titleArt from '../../assets/tabletop-title-v2.webp?inline';

const phaseNames = { TURN_START: '准备掷骰', MOVING: '移动中', BUY_DECISION: '购买决策',
  UPGRADE_DECISION: '升级决策', DEBT_RESOLUTION: '欠租处理', TURN_END: '回合结束', GAME_OVER: '对局结束' };
Object.assign(phaseNames, { EXTRA_ROLL: '急行军 · 额外掷骰', CARD_DECISION: '空城计 · 扣租前决策', CARD_GAIN_DECISION: '背包已满 · 领取锦囊' });
phaseNames.DICE_DECISION = '选择行军落点';
const tierNames = { village: '县城', county: '郡治', capital: '名城' };
const factionName = (id) => factions.find((faction) => faction.id === id).name;
const facilityIndex = (tile) => tile.type === 'start' ? 0 : tile.type === 'event' ? 4 : ({ inn: 1, card: 2, marketTax: 3, advice: 5, redCliff: 6 }[tile.effect] ?? 5);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const propPosition = (index) => `--prop-x:${index % 5 * 25}%;--prop-y:${Math.floor(index / 5) * 100}%`;
const cardIcon = (card) => ['repair', 'commerce'].includes(card) ? `<span class="card-symbol" aria-hidden="true">${card === 'repair' ? '筑' : '商'}</span>` : `<span class="card-art" aria-hidden="true" style="--card-x:${{ rentShield: 0, stride: 50, fortune: 100 }[card]}%"></span>`;
const wealthChart = (player) => {
  const history = player.wealthHistory;
  const high = Math.max(1, ...history.map((point) => point.assets));
  const points = history.map((point, index) => `${8 + index / Math.max(1, history.length - 1) * 244},${70 - point.assets / high * 60}`).join(' ');
  return `<svg class="wealth-chart" viewBox="0 0 260 80" role="img" aria-label="${player.name}最近${history.length}轮财富变化"><path d="M8 10V70H252" fill="none" stroke="#c9ad7e"/><polyline points="${points}" fill="none" stroke="#9a6425" stroke-width="3"/></svg>`;
};
// Put the result on top, then tilt the whole cube toward the viewer.
const diceRotations = ['rotateX(90deg)', 'rotateZ(-90deg)', '', 'rotateX(180deg)', 'rotateZ(90deg)', 'rotateX(-90deg)']
  .map((orientation) => `rotateX(-52deg) rotateY(-24deg) ${orientation}`.trim());
const diceArtwork = (value) => {
  const pips = [[5], [1, 9], [1, 5, 9], [1, 3, 7, 9], [1, 3, 5, 7, 9], [1, 3, 4, 6, 7, 9]];
  return `<div class="dice-cube" style="--die-rotation:${diceRotations[(value || 1) - 1] || diceRotations[0]}" aria-hidden="true">${pips.map((dots, index) => `<span class="dice-face face-${index + 1}">${dots.map((position) => `<i class="dice-pip" style="grid-row:${Math.ceil(position / 3)};grid-column:${(position - 1) % 3 + 1}"></i>`).join('')}</span>`).join('')}</div>`;
};
const tokenContent = (player) => `<span class="token-art ${player.portraitKey}" aria-hidden="true"></span><span class="token-faction">${factionName(player.factionId)}</span>`;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createView(root, onCommand, onStart, onSpeed, { onExport, onImport, onConfirmImport, onCancelImport, onPause, onSound, onReportPause } = {}) {
  root.innerHTML = `<header class="topbar"><h1><img class="game-title" src="${titleArt}" alt="三国大富翁"></h1><div id="turn-status" role="status"></div>
    <nav class="toolbar" aria-label="对局工具"><button id="setup-button" type="button">新局设置</button><button id="export-save" type="button">导出存档</button><label class="file-button">导入存档<input id="import-save" type="file" accept=".json,application/json"></label>
    <button id="pause" type="button" aria-pressed="false">暂停</button><button id="sound" type="button" aria-pressed="false">音效：关闭</button><button id="help-button" type="button">玩法说明</button></nav></header>
    <dialog id="setup-dialog"><h2>开始新局</h2><form id="setup"><label>你的阵营 <select name="factionId">${factions.map((faction) => `<option value="${faction.id}">${faction.name}</option>`).join('')}</select></label>
    <label>阵营主将 <select name="humanId"></select></label>
    <label>终局模式 <select name="mode"><option value="classic">经典 · 其他势力破产</option><option value="rounds">进阶限轮 · 40 轮比资产</option></select></label>
    <label>经济预设 <select name="economy"><option value="standard">标准 · 3200 / 前两圈500 / 后续300</option><option value="compact">进阶紧张资金 · 500 / 80</option></select></label>
    <details><summary>高级设置</summary><label>复现种子（可选） <input name="seed" maxlength="80" placeholder="留空，每次新局自动生成"></label></details><p class="prototype-note">每次新局自动随机 · 魏·曹操 / 蜀·刘备 / 吴·孙权 · 40格行旅 · 存档请手动导出</p><div class="dialog-actions"><button type="submit">开始新局</button><button id="cancel-setup" type="button">返回对局</button></div></form></dialog>
    <section id="import-confirm" class="card" hidden><h2>确认导入存档</h2><p id="import-summary"></p><p>确认后替换当前对局；取消会继续原局。</p><button id="confirm-import" type="button">确认导入</button><button id="cancel-import" type="button">取消导入</button></section>
    <dialog id="estate-dialog" aria-labelledby="estate-title"><div class="estate-header"><h2 id="estate-title">我的城池与锦囊</h2><form method="dialog"><button>返回棋盘</button></form></div><div id="estate-content"></div></dialog>
    <dialog id="help"><h2>行军与经营</h2><p>默认经典模式：无限轮行军，直到其他势力破产。标准新局每人3200金；前两圈每经过10格领取125金，之后每段75金，一圈基础300金。完整两城组每圈额外80金，三城组120金，在经过起点时结算。掷一颗六面骰，顺时针走过40格；经过土地不收费，仅结算落点。</p>
    <p>环路分中原、荆襄、江东、巴蜀四段，使用汉末至三国地名。县城、郡治、名城是游戏经济等级；州郡县关系见地块详情。线路是主题行旅，地理区域不代表固定阵营归属。魏以曹操为首版代表主将。</p>
    <p>无主地可购买或放弃，购地立即得到一级建筑。点击“我的城池”可在掷骰前或行军结束后主动建设；每回合与落点升级共用一次机会，最多三级，刚买的城池下回合才能升级。完成自己的第一圈后才能建设三级。完整城组租金+30%；三城组持有两座租金+15%，不叠加。单城也可升级。现金储备提示供参考，仍可自主重仓。</p>
    <p>掷出首次骰点后，可以直接行军，或花60金调整±1点（最终1～6点），每圈最多一次，完成一圈恢复机会；不与千里走单骑叠加，急行军额外骰不能调度。欠款可拆一级建筑或卖城，均按实际投入的60%向下取整回收；拆建筑保留土地和城组，出售整城归还系统。界面优先建议处置零散资产，仍可自选。</p>
    <p>空城计免本次租金，最多持有一张；千里走单骑在掷骰前让移动 +2；生财有道在掷骰前 +100 金；修城令让本回合一次升级费用减半；商路兴盛使一座己方城池租金+25%，到使用轮次+3轮开始失效，与城组加成相加。掷骰前每回合最多主动用一张，免租响应单独处理。背包最多三张。仅实际停靠颍川驿、隆中或江东集市后，可免费随机领取或购买本次展示的五折锦囊，二选一；商品固定，读档不刷新；经过不算；结束回合后机会失效。隆中不再固定赠送空城计。</p>
    <p>事件有奖罚、急行军、军令延误和赠锦囊。随机锦囊采用个人牌袋：五种打乱后依次发放，发完再洗牌；固定赠送与购买不消耗牌袋。已持有空城计时随机改抽下一张，固定赠送不重复领取。背包满时可替换或放弃，放弃的牌也算已抽取。每回合最多一次额外骰；跳过仍计行动机会。</p>
    <p>全场至少24座城被持有、至少6座达到三级后，进入商业繁荣：每12个完整轮次租金倍率增加0.25，购地、建设、补给与城组收入保持原值；触发后持续生效。完整轮次指所有存活角色各行动一次，不是地图圈数。</p>
    <p>经典模式只剩一人结束；进阶限轮模式40轮后按现金+实际投入排名，同分并列。进阶紧张资金预设为500 / 80金，无开拓补助。AI使用相同规则，不知未来随机结果。浏览器允许时每次行动自动保存，建议定期导出JSON。支持40格v3/v4/v5/v6/v7存档：旧存档沿用原经济参数，锦囊铺采用免费与五折二选一；已有锦囊保留，战报从恢复后记录。旧版24格存档无法恢复。</p>
    <p>费用、估值、格子分布为首版实验参数；没有联机和账号。原创素材与提示音不需要网络。</p><form method="dialog"><button>关闭说明</button></form></dialog>
    <div class="game-layout"><aside class="players-column" aria-label="玩家与记录"><section class="card players-panel"><h2>三方势力</h2><div id="players"></div></section>
    <section class="card log-panel"><p id="latest-log"></p><details class="log-history" open><summary>对局记录</summary><ol id="log"></ol></details></section></aside>
    <section class="map-panel" aria-label="40 格环路地图"><div id="board" class="board" style="--board-columns:${boardLayout.columns};--board-rows:${boardLayout.rows}"></div></section>
    <aside class="operations-column" aria-label="操作与土地详情"><section class="card speed-panel">
    <button id="estate-button" type="button" aria-haspopup="dialog" aria-controls="estate-dialog"><span aria-hidden="true">城</span>我的城池</button>
    <button id="report-button" type="button" hidden>查看战报</button><label>AI / 移动速度 <select id="speed"><option value="normal">普通</option><option value="fast">快速</option><option value="instant">跳过等待</option></select></label><p id="save-status" class="save-status"></p>
    </section><section class="card" id="actions" aria-label="当前操作"></section>
    <section class="card" id="tile-info" aria-label="土地详情">点击地图格子查看信息。</section></aside></div>
    <dialog class="result" id="result" aria-labelledby="result-title" hidden></dialog>
    <div id="feedback" aria-live="polite" aria-relevant="additions" aria-label="对局动态"></div><p id="message" role="alert"></p>
    <div id="card-tooltip" class="card-tooltip" role="tooltip" hidden></div>`;
  // Direct shared rules avoid both repeated large URLs and browser size limits
  // on CSS custom-property values. The images remain embedded and offline.
  const artStyle = document.createElement('style');
  artStyle.textContent = `.portrait{background-image:url("${portraitArt}")}.token-art{background-image:url("${pawnArt}")}.building-art{background-image:url("${buildingArt}")}.facility-art{background-image:url("${facilityArt}")}.card-art{background-image:url("${cardArt}")}.dice-backdrop{background-image:url("${diceStageArt}")}`;
  root.append(artStyle);
  const boardElement = root.querySelector('#board');
  boardElement.innerHTML = `<div class="map-center"><img class="scene-art" src="${sceneArt}" alt="" aria-hidden="true"><span class="landscape-label central">中原</span><span class="landscape-label jing">荆襄</span><span class="landscape-label east">江东</span><span class="landscape-label west">巴蜀</span><div class="map-caption"></div><div id="economy-status" class="economy-caption" aria-label="经营概览"></div><div class="ownership-legend"><span class="unowned">无主</span><span class="wei">魏</span><span class="shu">蜀</span><span class="wu">吴</span></div></div>`;
  const mapCenter = boardElement.firstElementChild;
  const tooltip = root.querySelector('#card-tooltip');
  let tooltipTarget;
  const hideCardTooltip = () => {
    tooltip.hidden = true;
    tooltipTarget?.removeAttribute('aria-describedby');
    tooltipTarget = null;
  };
  const showCardTooltip = (target) => {
    hideCardTooltip();
    tooltipTarget = target;
    target.setAttribute('aria-describedby', 'card-tooltip');
    tooltip.innerHTML = `<strong>${escapeHtml(cards[target.dataset.cardInfo].name)}</strong>${escapeHtml(cardDescription(target.dataset.cardInfo))}`;
    tooltip.hidden = false;
    const anchor = target.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = Math.max(12, Math.min(anchor.left, window.innerWidth - box.width - 12)) + 'px';
    tooltip.style.top = Math.max(12, anchor.bottom + box.height + 20 <= window.innerHeight ? anchor.bottom + 8 : anchor.top - box.height - 8) + 'px';
  };
  root.addEventListener('pointerover', (event) => {
    const target = event.target.closest('[data-card-info]');
    if (target && target !== tooltipTarget) showCardTooltip(target);
  });
  root.addEventListener('pointerout', (event) => {
    if (tooltipTarget?.contains(event.target) && !tooltipTarget.contains(event.relatedTarget)) hideCardTooltip();
  });
  root.addEventListener('focusin', (event) => {
    const target = event.target.closest('[data-card-info]');
    if (target) showCardTooltip(target);
  });
  root.addEventListener('focusout', hideCardTooltip);
  root.addEventListener('scroll', hideCardTooltip, true);
  root.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideCardTooltip(); });
  window.addEventListener('resize', hideCardTooltip);
  const speed = root.querySelector('#speed');
  const factionSelect = root.querySelector('[name="factionId"]');
  const populateCharacters = () => {
    root.querySelector('[name="humanId"]').innerHTML = characters.filter((character) => character.factionId === factionSelect.value).map((character) => `<option value="${character.id}">${character.name}</option>`).join('');
  };
  populateCharacters();
  factionSelect.addEventListener('change', populateCharacters);
  speed.addEventListener('change', () => onSpeed(speed.value));
  root.querySelector('#setup').addEventListener('submit', (event) => {
    event.preventDefault();
    pendingSale = null;
    const form = new FormData(event.currentTarget);
    onStart({ humanId: form.get('humanId'), seed: form.get('seed').trim() || undefined, mode: form.get('mode'), economy: form.get('economy') });
    root.querySelector('#setup-dialog').close();
  });
  root.querySelector('#setup-button').addEventListener('click', () => root.querySelector('#setup-dialog').showModal());
  root.querySelector('#estate-button').addEventListener('click', () => { renderEstates(); root.querySelector('#estate-dialog').showModal(); });
  root.querySelector('#cancel-setup').addEventListener('click', () => root.querySelector('#setup-dialog').close());
  root.querySelector('#export-save').addEventListener('click', () => onExport?.());
  root.querySelector('#import-save').addEventListener('change', (event) => {
    const file = event.target.files[0]; event.target.value = ''; if (file) onImport?.(file);
  });
  root.querySelector('#confirm-import').addEventListener('click', () => { pendingSale = null; onConfirmImport?.(); });
  root.querySelector('#cancel-import').addEventListener('click', () => onCancelImport?.());
  root.querySelector('#help-button').addEventListener('click', () => root.querySelector('#help').showModal());
  root.querySelector('#pause').addEventListener('click', () => onPause?.());
  root.querySelector('#sound').addEventListener('click', () => onSound?.());
  let latestState;
  let dismissedReport = null;
  const reportDialog = root.querySelector('#result');
  const reportKey = () => latestState.phase === Phase.GAME_OVER ? 'final' : latestState.players.find((p) => p.human).alive ? null : 'eliminated';
  function closeReport() {
    dismissedReport = reportKey(); reportDialog.close(); reportDialog.hidden = true;
    onReportPause?.(false);
  }
  function renderReport(force = false) {
    const key = reportKey();
    root.querySelector('#report-button').hidden = !key;
    if (!key || (!force && dismissedReport === key)) { reportDialog.close(); reportDialog.hidden = true; return; }
    if (!reportDialog.open || force) {
      reportDialog.innerHTML = battleReportMarkup(latestState, wealthChart);
      reportDialog.hidden = false;
      root.querySelector('#estate-dialog').close();
      reportDialog.showModal(); onReportPause?.(true);
    }
  }
  reportDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeReport(); });
  root.querySelector('#report-button').addEventListener('click', () => renderReport(true));
  reportDialog.addEventListener('click', (event) => {
    const button = event.target.closest('[data-report]');
    if (!button) return;
    closeReport();
    if (button.dataset.report === 'restart') root.querySelector('#setup-dialog').showModal();
  });
  let selectedIndex = null;
  const feedbackTimers = new Map();
  function clearFeedback() {
    for (const timer of feedbackTimers.values()) clearTimeout(timer);
    feedbackTimers.clear();
    root.querySelector('#feedback').replaceChildren();
  }
  function showActivity(state, previous, events) {
    // Dice and movement already have their own visual cues. Summarize the
    // outcome of each action, including actions with no cash change.
    const messages = events.filter((message) => !/ 掷出 \d+ 点。$| 到达 .+。$|放弃本次购买 \/ 升级|停在起点|事件关闭，无效果/.test(message));
    if (!messages.length) return;
    const text = messages.join(' ');
    const category = /破产/.test(text) ? '破产' : /出售/.test(text) ? '出售土地' : /购买/.test(text) ? '购买城池' : /升级/.test(text) ? '升级建筑' : /使用/.test(text) ? '使用锦囊' : /欠款/.test(text) ? '欠款待处理' : /可在扣租/.test(text) ? '过路费待决定' : /过路费/.test(text) ? '支付过路费' : /锦囊|替换/.test(text) ? '锦囊动态' : /俸禄/.test(text) ? '领取俸禄' : '地点事件';
    const changes = state.players.map((p) => ({ player: p, amount: p.cash - previous.players.find((old) => old.id === p.id).cash })).filter((change) => change.amount);
    const notification = document.createElement('div');
    notification.className = 'activity-toast';
    notification.innerHTML = `<span class="activity-kind">${category}</span><p class="activity-description">${messages.map(escapeHtml).join('<br>')}</p>${changes.length ? '<div class="activity-amounts">' + changes.map(({ player: p, amount }) => '<span class="cash-change ' + (amount > 0 ? 'gain' : 'loss') + '">' + escapeHtml(p.name) + ' ' + (amount > 0 ? '+' : '−') + Math.abs(amount) + ' 金</span>').join('') + '</div>' : ''}`;
    const feedback = root.querySelector('#feedback');
    // Keep recent actions in order without creating a long backlog in fast AI play.
    while (feedback.children.length >= 3) {
      const oldest = feedback.firstElementChild;
      clearTimeout(feedbackTimers.get(oldest)); feedbackTimers.delete(oldest); oldest.remove();
    }
    feedback.append(notification);
    feedbackTimers.set(notification, setTimeout(() => { notification.remove(); feedbackTimers.delete(notification); }, 5600));
  }
  let pendingSale = null;
  let pendingDemolition = null;
  let selectedSaleId = null;
  root.addEventListener('change', (event) => {
    if (event.target.id !== 'sale-land') return;
    selectedSaleId = event.target.value;
    render(latestState);
  });
  const motionAnimations = new Set();
  function cancelMotion() {
    for (const animation of motionAnimations) animation.cancel();
    motionAnimations.clear();
    root.querySelectorAll('.moving-piece').forEach((piece) => piece.remove());
    root.querySelectorAll('.token').forEach((token) => { token.style.visibility = ''; });
    root.querySelector('.turn-dice')?.classList.remove('rolling');
  }
  function cardDescription(card) {
    if (card === 'stride') return `掷骰前使用，本回合首次移动额外 +${latestState.config.strideBonus} 格。`;
    if (card === 'fortune') return `掷骰前使用，立即获得 ${latestState.config.fortuneAmount} 金。`;
    if (card === 'repair') return `掷骰前使用，本回合一次升级费用降低 ${Math.round(latestState.config.repairDiscount * 100)}%；回合结束失效。`;
    if (card === 'commerce') return `对一座己方城池使用，租金提高 ${Math.round(latestState.config.tradeRentBonus * 100)}%，到第 ${latestState.round + latestState.config.tradeDuration} 轮开始失效，不叠加。`;
    return cards[card].description;
  }
  root.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-cell]');
    if (tile) { selectedIndex = Number(tile.dataset.cell); details(true); }
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    if (button.dataset.action === 'PREPARE_SELL') { pendingSale = button.dataset.tile; pendingDemolition = null; render(latestState); return; }
    if (button.dataset.action === 'PREPARE_DEMOLISH') { pendingDemolition = button.dataset.tile; pendingSale = null; render(latestState); return; }
    if (button.dataset.action === 'CANCEL_SELL') { pendingSale = null; pendingDemolition = null; render(latestState); return; }
    if (button.dataset.action === 'OPEN_COMMERCE') { renderEstates(); root.querySelector('#estate-dialog').showModal(); return; }
    const command = { type: button.dataset.action, actorId: currentPlayer(latestState).id,
      revision: Number(button.dataset.revision), tileId: button.dataset.tile, card: button.dataset.card,
      replaceIndex: Number(button.dataset.replace), delta: Number(button.dataset.delta) };
    pendingSale = null; pendingDemolition = null;
    onCommand(command);
  });

  function details(open = false) {
    const box = root.querySelector('#tile-info');
    if (selectedIndex === null) {
      box.innerHTML = '<details id="tile-details"><summary>地点详情</summary><p>点击城池或设施查看。</p></details>';
      return;
    }
    const wasOpen = box.querySelector('details')?.open;
    const tile = latestState.board[selectedIndex];
    const owner = latestState.players.find((p) => p.id === tile.ownerId);
    box.innerHTML = `<details id="tile-details" ${open || wasOpen ? 'open' : ''}><summary>${tile.name} · ${regions[tile.regionId].name}</summary>
      ${tile.type === 'land' ? `<p>${tierNames[tile.tier]} · ${owner ? factionName(owner.factionId) + '·' + owner.name : '无主'} · 建筑${tile.level}级</p>
      <p>地价 ${landPrice(latestState, tile)} · 投入 ${tile.investment}<br>租金 ${[1, 2, 3].map((level) => rent(latestState, tile, level)).join(' / ')}<br>升级 ${latestState.config.upgradeMultipliers.map((value) => Math.round(landPrice(latestState, tile) * value)).join(' / ')}</p>
      <p class="city-group">${groupDescription(latestState, tile)}</p><p class="administration">${tile.province} · ${tile.commandery} · ${tile.county}</p>` : `<p>${tile.type === 'start' ? (latestState.config.segmentedIncome ? '每经过10格领取分段补给，完成一圈另结算完整城组经营收益' : '完成一圈领取 ' + latestState.config.salaryPerLap + ' 金') : tile.type === 'event' ? '抽取经济、行动或策略事件' : ({ inn: '补给 +' + latestState.config.facilityAmounts.inn + ' 金', marketTax: '税费 ' + latestState.config.facilityAmounts.marketTax + ' 金', card: '随机获得锦囊', advice: '停靠后免费 / 五折二选一', redCliff: '补给 +' + latestState.config.facilityAmounts.redCliff + ' 金' }[tile.effect] || '主题地点')}</p>`}
      ${tile.cardShop ? '<p class="shop-location-note">锦囊铺 · 仅实际停靠后免费 / 五折二选一，经过不算。</p>' : ''}<details class="history"><summary>历史与地点</summary><p>${tile.effect === 'advice' ? '隆中对的历史主题地点；设有游戏锦囊铺。' : tile.history}</p></details></details>`;
    root.querySelectorAll('.tile.selected').forEach((button) => button.classList.remove('selected'));
    root.querySelector('[data-cell="' + selectedIndex + '"]')?.classList.add('selected');
  }
  function actionButton(type, label, disabled = false, tileId = '', card = '', replaceIndex = -1) {
    return `<button type="button" data-action="${type}" data-revision="${latestState.revision}" data-tile="${tileId}" data-card="${card}" data-replace="${replaceIndex}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  }
  function groupDescription(state, tile) {
    const group = cityGroup(state, tile);
    if (!group) return '';
    const owned = group.tileIds.filter((id) => state.board.find((land) => land.id === id).ownerId === tile.ownerId && tile.ownerId).length;
    return `${group.name} · ${owned}/${group.tileIds.length} · ${group.bonus ? `租金+${Math.round(group.bonus * 100)}%` : '收齐享城组加成'}${group.complete ? ` · 经营收益${group.income}金/圈` : state.config.groupIncomePerCity ? ` · 收齐后${group.tileIds.length * state.config.groupIncomePerCity}金/圈` : ''} · ${group.tileIds.map((id) => state.board.find((land) => land.id === id).name).join('、')}${tile.tradeUntilRound > state.round ? ` · 商路兴盛至第${tile.tradeUntilRound}轮开始` : ''}`;
  }
  function renderEstates() {
    const state = latestState;
    const human = state.players.find((p) => p.human);
    const holding = assets(state, human.id);
    const acting = currentPlayer(state).id === human.id && human.alive;
    const managing = acting && [Phase.TURN_START, Phase.TURN_END, Phase.UPGRADE_DECISION].includes(state.phase) && !state.turnSkipped;
    const trading = acting && state.phase === Phase.TURN_START && !state.activeCardUsed && human.cards.includes('commerce');
    const bonus = human.laps < state.config.openingBonusLaps ? state.config.openingBonusPerLap : 0;
    const prosperity = state.prosperityStartRound === null ? `尚未进入商业繁荣（需${state.config.prosperityOwnedThreshold}座已持有城、${state.config.prosperityLevel3Threshold}座三级城）` : `商业繁荣 ×${prosperityMultiplier(state).toFixed(2)} · ${state.config.prosperityInterval - (state.completedRounds - state.prosperityStartRound) % state.config.prosperityInterval}个完整轮次后增加${state.config.prosperityStep}`;
    root.querySelector('#estate-content').innerHTML = `<p>现金 ${human.cash} 金 · 总资产 ${holding.total} 金 · 城池 ${holding.count} · 三级城 ${holding.maxLevelCount}<br>累计收租 ${human.stats.rentCollected} 金 · 最高单笔 ${human.stats.largestRent} 金</p>
      <p class="economy-details">正在第${human.laps + 1}圈 · 每圈补给${state.config.salaryPerLap + bonus}金 · 城组经营收益${groupIncome(state, human.id)}金/圈<br>${bonus ? `开拓补助剩余${state.config.openingBonusLaps - human.laps}圈，每圈含${bonus}金；之后基础补给${state.config.salaryPerLap}金。` : '当前无开拓补助。'}${state.config.diceAdjustEnabled ? ` 调度${human.diceAdjustUsed ? '本圈已使用' : `本圈可用一次，费用${state.config.diceAdjustCost}金`}。` : ''}<br>建议现金储备${cashReserve(state, human)}金${state.config.level3AfterLap && human.laps < state.config.level3AfterLap ? ' · 完成第一圈后可建设三级' : ''}<br>${state.config.prosperityEnabled ? prosperity : '旧规则：无商业繁荣增长'}</p>
      <p>${!managing ? '当前阶段仅可查看城池。掷骰前或行军结束后可建设。' : state.upgradeUsed ? '本回合已建设一次，下回合继续。' : '本回合可建设一次；本回合新购城池下回合才能升级。'}${state.repairReady ? ' 修城令已生效：一次建设费用减半。' : ''}</p>
      <div class="estate-list">${state.board.filter((land) => land.ownerId === human.id).map((land) => `<article class="estate-item"><strong>${land.name} · ${land.level}级</strong><p>${groupDescription(state, land)}</p><p>投入 ${land.investment} 金 · 当前租金 ${rent(state, land)} 金${land.level < 3 ? `<br>升级 ${upgradeCost(state, land)} 金 · 租金 ${rent(state, land)} → ${rent(state, land, land.level + 1)} 金 · 余额 ${human.cash - upgradeCost(state, land)} 金${human.cash - upgradeCost(state, land) < cashReserve(state, human) ? ' · 低于建议储备' : ''}${land.level === 2 && human.laps < state.config.level3AfterLap ? ' · 完成第一圈后解锁' : ''}` : ' · 已达最高级'}</p>${land.level < 3 ? actionButton('MANAGE_UPGRADE', `建设 ${land.name}`, !managing || !canUpgrade(state, land) || human.cash < upgradeCost(state, land), land.id) : ''}${trading ? actionButton('USE_CARD', `兴盛 ${land.name}`, land.tradeUntilRound > state.round, land.id, 'commerce') : ''}</article>`).join('') || '<p>尚无城池，踩到无主城池即可购买。</p>'}</div>
      <h3>锦囊铺 · 免费 / 五折二选一</h3><p>${canShop(state, human) ? `已停靠${state.board[human.position].name}，以下两项只能选一项，结束回合后失效。` : state.shopUsed && acting ? '本次已作出选择，免费与五折机会均已消耗。' : '仅实际停靠颍川驿、隆中或江东集市后开放；经过不算。'}背包 ${human.cards.length}/${state.config.cardCapacity} · 空城计最多持有一张。</p><div class="shop-list">
      <article class="shop-item"><strong>免费随机锦囊 · 0 金</strong><p>领取后揭晓，沿用个人五种牌袋。背包满时可替换或放弃；放弃也消耗本次机会。</p>${actionButton('FREE_CARD', '免费领取随机锦囊', !canShop(state, human))}</article>
      <article class="shop-item"><strong>${acting && state.shopOffer ? cards[state.shopOffer].name + ' · 五折 ' + shopPrice(state) + ' 金' : '随机五折锦囊 · 停靠后揭晓'}</strong>${acting && state.shopOffer ? `<p>原价 <s>${state.config.cardPrices[state.shopOffer]} 金</s> · ${cardDescription(state.shopOffer)}</p><p>${human.cards.length >= state.config.cardCapacity ? '背包已满，购买需要空位。' : state.shopOffer === 'rentShield' && human.cards.includes('rentShield') ? '已持有空城计，可改选免费随机锦囊。' : human.cash < shopPrice(state) ? '现金不足，可改选免费随机锦囊。' : '本次商品固定，重开面板或读档不会刷新。'}</p>${actionButton('BUY_CARD', '购买 ' + cards[state.shopOffer].name, !canShop(state, human) || human.cards.length >= state.config.cardCapacity || human.cash < shopPrice(state) || state.shopOffer === 'rentShield' && human.cards.includes('rentShield'), '', state.shopOffer)}` : '<p>每次停靠随机展示一张商品，购买后放弃免费领取。</p>'}</article></div>
      <details><summary>财富历程与里程碑</summary>${wealthChart(human)}<p>历史最高资产 ${human.stats.peakAssets} 金 · 累计买地 ${human.stats.purchases} 次 · 建设 ${human.stats.upgrades} 次</p><p>${human.stats.milestones.join(' · ') || '继续买地、建设和收租，积累你的财富里程碑。'}</p></details>`;
  }
  function render(state, events = []) {
    cancelMotion();
    hideCardTooltip();
    const previous = latestState;
    latestState = state;
    const player = currentPlayer(state);
    root.querySelector('.prototype-note').textContent = '新局采用所选经济预设，自动随机种子；当前对局进度会被替换，建议先导出备份。';
    const human = state.players.find((p) => p.human);
    const opening = human.laps < state.config.openingBonusLaps ? state.config.openingBonusPerLap : 0;
    const overview = root.querySelector('#economy-status');
    overview.textContent = `你的第${human.laps + 1}圈 · 补给${state.config.salaryPerLap + opening}金/圈\n城组${groupIncome(state, human.id)}金/圈 · 租金×${prosperityMultiplier(state).toFixed(2)}`;
    overview.title = state.prosperityStartRound === null ? `开拓补助剩余${Math.max(0, state.config.openingBonusLaps - human.laps)}圈。${state.config.prosperityEnabled ? `商业繁荣条件：${state.config.prosperityOwnedThreshold}城被持有、${state.config.prosperityLevel3Threshold}座三级城。` : '此存档沿用旧版经济规则。'}` : `商业繁荣：${state.config.prosperityInterval - (state.completedRounds - state.prosperityStartRound) % state.config.prosperityInterval}个完整轮次后租金倍率增加${state.config.prosperityStep}。`;
    root.querySelector('#turn-status').textContent = `第 ${state.round}${state.mode === 'rounds' ? ` / ${state.config.defaultRoundLimit}` : ''} 轮 · ${state.mode === 'classic' ? '经典 · ' : ''}${player.name}（${player.human ? '玩家' : 'AI'}）· ${phaseNames[state.phase]} · 骰点 ${state.dice ?? '—'}`;
    root.querySelector('#players').innerHTML = state.players.map((p) => {
      const value = assets(state, p.id);
      return `<div class="player ${p.factionId} ${p.id === player.id ? 'active' : ''} ${p.alive ? '' : 'eliminated'}" title="${p.human ? '玩家' : p.aiStyle === 'conservative' ? '保守 AI' : '激进 AI'}">
      <div class="player-heading"><span class="portrait ${p.portraitKey}" role="img" aria-label="${p.name}Q版肖像"></span><strong>${factionName(p.factionId)} · ${p.name}${p.human ? '（你）' : '（AI）'}${p.alive ? '' : ' · 已破产'}</strong></div>
      <p class="player-cash">现金 <b>${p.cash}</b></p><p class="player-assets">总资产 ${value.total}</p>
      <details class="player-details"><summary>土地 ${value.count} · 锦囊 ${p.cards.length}${p.skipTurns ? ' · 待跳过' : ''}</summary><p>三级城 ${value.maxLevelCount} · 累计收租 ${p.stats.rentCollected} 金<br>最高单笔 ${p.stats.largestRent} 金 · 投入 ${value.investment}<br>已行 ${p.laps} 圈</p><div class="card-list">${p.cards.map((card) => '<span class="mini-card" role="img" tabindex="0" data-card-info="' + card + '" aria-label="' + cards[card].name + '">' + cardIcon(card) + '</span>').join('') || '无锦囊'}</div></details></div>`;

    }).join('');
    const location = state.board[player.position];
    mapCenter.querySelector('.map-caption').innerHTML = `${escapeHtml(player.name)} · ${escapeHtml(location.name)} <span aria-label="顺时针行军">↻</span>`;
    // Keep the large landscape image mounted across turns and update only tiles.
    boardElement.replaceChildren(mapCenter);
    boardElement.insertAdjacentHTML('beforeend', state.board.map((tile, index) => {
      const [row, column] = cellCoordinates[index];
      const owner = state.players.find((p) => p.id === tile.ownerId);
      const changed = events.length && previous && previous.board[index].ownerId !== tile.ownerId && tile.ownerId;
      const upgraded = events.length && previous && previous.board[index].level < tile.level && !changed;
      return `<button type="button" class="tile ${tile.type} ${tile.tier || ''} ${owner?.factionId || 'unowned'} ${index === player.position ? 'current-location' : ''} ${changed ? 'newly-claimed' : upgraded ? 'newly-upgraded' : ''}" style="grid-row:${row};grid-column:${column}" data-cell="${index}" aria-label="${regions[tile.regionId].name}，${tile.name}，${tierNames[tile.tier] || tile.type}，${owner ? factionName(owner.factionId) + '·' + owner.name : '无主'}，建筑${tile.level}级">
        ${tile.type === 'land' ? `<i class="building-art ${tile.tier} level-${tile.level} ${tile.level ? 'built' : ''}" aria-hidden="true"></i>${owner ? '<i class="ownership-flag" aria-label="' + factionName(owner.factionId) + '占领">' + factionName(owner.factionId) + '</i><span class="level-badge" aria-label="建筑' + tile.level + '级">' + ['','Ⅰ','Ⅱ','Ⅲ'][tile.level] + '</span>' : ''}${cityGroup(state, tile)?.complete && state.config.groupRentBonus ? '<span class="group-badge" aria-label="城组已完成">连城</span>' : ''}` : `<i class="facility-art" style="${propPosition(facilityIndex(tile))}" aria-hidden="true"></i>`}<strong>${tile.name}</strong>
        ${tile.cardShop ? '<span class="shop-badge" aria-label="锦囊铺">锦囊</span>' : ''}<div class="tokens">${state.players.filter((p) => p.alive && p.position === index).map((p) => '<b class="token ' + p.factionId + '" data-player="' + p.id + '" aria-label="' + p.name + '，' + factionName(p.factionId) + '国">' + tokenContent(p) + '</b>').join('')}</div></button>`;
    }).join(''));
    const action = root.querySelector('#actions');
    action.dataset.phase = state.phase;
    const tile = state.board[player.position];
    action.innerHTML = `<div class="action-heading"><h2>${phaseNames[state.phase]}</h2><span class="dice-caption">${state.dice ? `本次掷出 ${state.dice} 点` : '等待掷骰'}</span></div><div class="dice-stage"><div class="dice-table"><div class="dice-backdrop" aria-hidden="true"></div><div class="dice-plinth" aria-hidden="true"></div><div class="dice-shadow" aria-hidden="true"></div><div class="dice-pivot"><div class="turn-dice" aria-label="骰点${state.dice || '未掷'}">${diceArtwork(state.dice)}</div></div></div></div>`;
    if (state.phase === Phase.GAME_OVER) action.innerHTML += '<p>对局结束。可以开始新局。</p>';
    else if (!player.alive || !player.human || state.phase === Phase.MOVING) action.innerHTML += `<p class="waiting-note">${player.alive ? `${player.name}行军中…` : `${player.name}已出局，等待其他势力行军…`}</p>`;
    else if (state.phase === Phase.DICE_DECISION) {
      const destination = (delta) => state.board[(player.position + state.dice + delta) % state.board.length];
      const preview = (delta) => {
        const land = destination(delta);
        const owner = state.players.find((p) => p.id === land.ownerId);
        const info = land.type !== 'land' ? '设施 / 事件' : !owner ? `可购${landPrice(state, land)}金` : owner.id === player.id ? '己方城池' : `租金${rent(state, land)}金`;
        return `${state.dice + delta}点 · ${land.name} · ${info}`;
      };
      action.innerHTML += `<div class="dice-routing"><p>${preview(0)}</p>${actionButton('CONFIRM_MOVE', '按原点数行军')}<p>本圈调度机会剩余1次 · 花费${state.config.diceAdjustCost}金，余额${player.cash - state.config.diceAdjustCost}金</p><div class="route-options">${[-1, 1].map((delta) => state.dice + delta < 1 || state.dice + delta > state.config.diceSides ? '' : actionButton('ADJUST_DICE', `${delta > 0 ? '+1' : '−1'}点：${preview(delta)}`).replace('<button ', `<button data-delta="${delta}" `)).join('')}</div></div>`;
    }
    else if (state.phase === Phase.TURN_START) {
      action.innerHTML += actionButton('ROLL', '掷骰子') + (player.moveBonus ? `<p>千里走单骑：本次移动额外 +${player.moveBonus} 格。</p>` : '');
      let hand = `<div class="inventory"><h3>我的锦囊 ${player.cards.length} / ${state.config.cardCapacity}</h3>`;
      hand += '<div class="card-hand">';
      for (const card of player.cards) {
        const hint = cardDescription(card);
        const disabled = state.activeCardUsed || (card === 'stride' && Boolean(player.moveBonus)) || (card === 'repair' && (state.upgradeUsed || !state.board.some((land) => canUpgrade(state, land) && player.cash >= upgradeCost(state, land, true)))) || (card === 'commerce' && !state.board.some((land) => land.ownerId === player.id && land.tradeUntilRound <= state.round));
        hand += card === 'rentShield' ? '<span class="card-token" role="img" tabindex="0" data-card-info="' + card + '" aria-label="空城计：' + hint + '">' + cardIcon(card) + '<span>空城计</span></span>' : actionButton(card === 'commerce' ? 'OPEN_COMMERCE' : 'USE_CARD', '使用 ' + cards[card].name, disabled, '', card).replace('<button ', '<button class="card-use" data-card-info="' + card + '" aria-label="使用 ' + cards[card].name + '" ').replace('>使用 ' + cards[card].name + '</button>', '>' + cardIcon(card) + '<span>' + cards[card].name + '</span></button>');
      }
      if (!player.cards.length) hand += '<span class="empty-hand">暂无锦囊</span>';
      action.innerHTML += hand + '</div></div>';
    }
    else if (state.phase === Phase.EXTRA_ROLL) action.innerHTML += '<p>急行军使本回合额外行动一次；重复事件不会连锁。</p>' + actionButton('ROLL', '额外掷骰子');
    else if (state.phase === Phase.TURN_END) action.innerHTML += `<p>${state.turnSkipped ? '军令延误：本次行动跳过。' : state.upgradeUsed ? '本回合已建设一次。' : '可在“我的城池”建设一次，再结束回合。'}</p>${player.human && canShop(state, player) ? '<p class="shop-arrival">已停靠锦囊铺，可免费领取或购买五折锦囊。</p>' + actionButton('OPEN_COMMERCE', '前往锦囊铺') : ''}` + actionButton('END_TURN', '结束回合');
    else if (state.phase === Phase.BUY_DECISION || state.phase === Phase.UPGRADE_DECISION) {
      const buying = state.phase === Phase.BUY_DECISION;
      const cost = buying ? landPrice(state, tile) : upgradeCost(state, tile);
      const previewState = buying ? { ...state, board: state.board.map((land) => land.id === tile.id ? { ...land, ownerId: player.id, level: 1 } : land) } : state;
      const previewTile = previewState.board[tile.index];
      action.innerHTML += `<div class="decision-summary"><p><strong>${tile.name}</strong> · ${buying ? '含一级建筑' : `${tile.level} → ${tile.level + 1}级`}${buying && cityGroup(previewState, previewTile)?.complete ? ' · 补齐城组' : ''}</p><dl class="decision-costs"><div><dt>费用</dt><dd>${cost} 金</dd></div><div><dt>当前现金</dt><dd>${player.cash} 金</dd></div><div><dt>操作后余额</dt><dd>${player.cash - cost} 金</dd></div><div><dt>租金</dt><dd>${buying ? '0' : rent(state, tile)} → ${rent(previewState, previewTile, buying ? 1 : tile.level + 1)} 金</dd></div></dl></div>`;
      action.innerHTML += `<p class="reserve-note">建议储备${cashReserve(state, player)}金${player.cash - cost < cashReserve(state, player) ? ' · 本次操作后低于储备，可自主选择' : ''}</p>`;
      action.innerHTML += '<div class="decision-buttons">' + actionButton(buying ? 'BUY' : 'UPGRADE', buying ? '确认购买' : '确认升级', player.cash < cost) + actionButton('PASS', '放弃') + '</div>';
      if (player.cash < cost) action.innerHTML += '<p>现金不足，无法确认。</p>';
    } else if (state.phase === Phase.DEBT_RESOLUTION) {
      const holding = assets(state, player.id);
      action.innerHTML += `<p>${escapeHtml(state.debt.reason)} · 应付 ${state.debt.amount} 金 · 当前现金 ${player.cash} 金<br>还差 ${state.debt.amount - player.cash} 金 · 可回收 ${holding.recovery} 金</p>`;
      const recommendations = disposalOptions(state, player.id);
      const holdings = state.board.filter((item) => item.ownerId === player.id).sort((a, b) => recommendations.findIndex((option) => option.type === 'SELL' && option.tileId === a.id) - recommendations.findIndex((option) => option.type === 'SELL' && option.tileId === b.id));
      if (pendingDemolition) {
        const land = holdings.find((item) => item.id === pendingDemolition);
        const balance = player.cash + demolitionValue(state, land).refund - state.debt.amount;
        action.innerHTML += `<p>确认拆除 ${land.name} 一层，降至${land.level - 1}级，回收${demolitionValue(state, land).refund}金？保留土地和城组，租金${rent(state, land)} → ${rent(state, land, land.level - 1)}金。${balance >= 0 ? `偿债后余额${balance}金。` : `仍差${-balance}金。`}</p><div class="decision-buttons">` + actionButton('DEMOLISH', '确认拆建筑', false, land.id) + actionButton('CANCEL_SELL', '取消拆建筑') + '</div>';
      } else if (pendingSale) {
        const land = holdings.find((item) => item.id === pendingSale);
        const balance = player.cash + Math.floor(land.investment * state.config.assetSellbackRatio) - state.debt.amount;
        const loss = recommendations.find((option) => option.type === 'SELL' && option.tileId === land.id);
        action.innerHTML += `<p>确认出售 ${land.name} 及建筑，回收 ${Math.floor(land.investment * state.config.assetSellbackRatio)} 金？${balance >= 0 ? `偿债后余额 ${balance} 金。` : `仍差 ${-balance} 金。`}租金合计减少${loss.rentLoss}金${loss.incomeLoss ? `，城组收入减少${loss.incomeLoss}金/圈` : ''}。出售不可撤销。</p><div class="decision-buttons">` + actionButton('SELL', '确认出售', false, pendingSale) + actionButton('CANCEL_SELL', '取消出售') + '</div>';
      } else if (holdings.length) {
        const preferred = recommendations[0];
        const land = holdings.find((item) => item.id === selectedSaleId) || holdings.find((item) => item.id === preferred.tileId);
        if (holdings.length > 1) action.innerHTML += `<label class="sale-picker">选择要出售的城池<select id="sale-land">${holdings.map((item) => `<option value="${item.id}" ${item.id === land.id ? 'selected' : ''}>${item.name} · 回收 ${Math.floor(item.investment * state.config.assetSellbackRatio)} 金</option>`).join('')}</select></label>`;
        const group = cityGroup(state, land);
        action.innerHTML += `<p class="reserve-note">${group?.complete ? `完整城组 · 出售损失${group.income}金/圈；可优先拆建筑` : group?.owned >= 2 ? '未完成连城 · 出售会减少城组收益加成' : '零散城池 · 可优先筹款'}</p>`;
        if (land.level > 1) action.innerHTML += actionButton('PREPARE_DEMOLISH', `拆建筑 ${land.name}（回收${demolitionValue(state, land).refund}金）`, false, land.id);
        action.innerHTML += actionButton('PREPARE_SELL', `出售 ${land.name}（回收 ${Math.floor(land.investment * state.config.assetSellbackRatio)} 金）`, false, land.id);
      }
      if (player.cash + holding.recovery < state.debt.amount) action.innerHTML += actionButton('BANKRUPT', '资产不足，确认破产');
    } else if (state.phase === Phase.CARD_DECISION) {
      action.innerHTML += `<p>即将支付 ${state.debt.amount} 金过路费。当前现金 ${player.cash} 金，尚未扣款。使用空城计免除本次租金？</p>` + actionButton('USE_SHIELD', '使用空城计，免除本次租金') + actionButton('PAY_RENT', '不使用，继续支付');
    } else if (state.phase === Phase.CARD_GAIN_DECISION) {
      action.innerHTML += `<p>获得 ${cards[state.pendingCard].name}，背包已满。选择替换一张或放弃新锦囊。</p>`;
      player.cards.forEach((card, index) => { action.innerHTML += actionButton('KEEP_CARD', `替换第 ${index + 1} 张 ${cards[card].name}`, false, '', '', index); });
      action.innerHTML += actionButton('DECLINE_CARD', '放弃新锦囊');
    }
    renderReport();
    if (state.phase === Phase.DICE_DECISION) {
      const routing = action.querySelector('.dice-routing');
      if (routing) { routing.hidden = true; routing.inert = true; }
    }
    root.querySelector('#latest-log').textContent = state.log.at(-1) || '';
    if (events.length && previous) showActivity(state, previous, events);
    root.querySelector('#log').innerHTML = state.log.slice(-10).reverse().map((message) => `<li>${escapeHtml(message)}</li>`).join('');
    details();
    if (state.phase === Phase.CARD_GAIN_DECISION && root.querySelector('#estate-dialog').open) root.querySelector('#estate-dialog').close();
    if (root.querySelector('#estate-dialog').open) renderEstates();
  }
  return { render, cancelMotion, message(text) { root.querySelector('#message').textContent = text; },
    diceDecisionRolling(value) {
      const action = root.querySelector('#actions');
      // Use the original full dice scene until the result has finished settling.
      action.dataset.phase = value ? Phase.MOVING : Phase.DICE_DECISION;
      action.querySelector('h2').textContent = value ? '摇骰中…' : phaseNames.DICE_DECISION;
      const routing = action.querySelector('.dice-routing');
      if (routing) { routing.hidden = value; routing.inert = value; }
    },
    confirmImport(state) { root.querySelector('#import-summary').textContent = `模式：${state.mode === 'classic' ? '经典' : '限轮'}；第 ${state.round} 轮；${phaseNames[state.phase]}。`; root.querySelector('#import-confirm').hidden = false; },
    hideImport() { root.querySelector('#import-confirm').hidden = true; },
    paused(value) { const button = root.querySelector('#pause'); button.textContent = value ? '继续' : '暂停'; button.setAttribute('aria-pressed', String(value)); root.querySelector('#actions').inert = value; root.querySelector('#estate-content').inert = value; },
    saved(value) { root.querySelector('#save-status').textContent = value ? '进度已自动保存 · 可导出备份' : '自动保存不可用 · 请导出备份'; },
    sound(value) { const button = root.querySelector('#sound'); button.textContent = value ? '音效：开启' : '音效：关闭'; button.setAttribute('aria-pressed', String(value)); },
    reset() { cancelMotion(); clearFeedback(); root.querySelector('#estate-dialog').close(); reportDialog.close(); reportDialog.hidden = true; dismissedReport = null; onReportPause?.(false); pendingSale = null; pendingDemolition = null; selectedSaleId = null; selectedIndex = null; latestState = null; },
    async animateDice(value, delay, valid) {
      const die = root.querySelector('.turn-dice');
      if (!die || !valid()) return;
      const cube = die.querySelector('.dice-cube');
      let tumbleTransform;
      if (delay() > 0 && !reducedMotion()) {
        die.classList.add('rolling');
        die.setAttribute('aria-label', '骰子摇动中');
        const frames = delay() >= 650 ? 10 : 4;
        for (let frame = 0; frame < frames; frame++) {
          if (!valid()) return;
          root.querySelector('.dice-caption').textContent = '摇骰中…';
          await new Promise((resolve) => setTimeout(resolve, Math.max(25, delay() / frames)));
        }
        if (!valid()) return;
        tumbleTransform = getComputedStyle(cube).transform;
        die.classList.remove('rolling');
      }
      const rotation = diceRotations[value - 1] || diceRotations[0];
      cube.style.setProperty('--die-rotation', rotation);
      if (tumbleTransform) {
        const settling = cube.animate([{ transform: tumbleTransform }, { transform: rotation }], {
          duration: Math.min(220, delay()), easing: 'ease-out',
        });
        motionAnimations.add(settling);
        try { await settling.finished; } catch { /* Cancelled by pause, speed change or a new game. */ }
        finally { motionAnimations.delete(settling); }
        if (!valid()) return;
      }
      root.querySelector('.dice-caption').textContent = `本次掷出 ${value} 点`;
      die.setAttribute('aria-label', `骰点${value}`);
      if (delay() > 0 && !reducedMotion()) await new Promise((resolve) => setTimeout(resolve, Math.min(300, delay())));
    },
    async animateMove(move, playerId, delay, valid) {
      if (!valid()) return;
      const token = root.querySelector(`.token[data-player="${playerId}"]`);
      if (!token) return;
      const start = token.getBoundingClientRect();
      const piece = token.cloneNode(true);
      piece.classList.remove('token'); piece.classList.add('moving-piece');
      piece.removeAttribute('data-player'); piece.setAttribute('aria-hidden', 'true');
      piece.style.left = start.left + 'px'; piece.style.top = start.top + 'px';
      piece.style.width = start.width + 'px'; piece.style.height = start.height + 'px';
      root.append(piece);
      token.style.visibility = 'hidden';
      let from = start;
      try {
        for (let step = 1; step <= move.steps; step++) {
          if (!valid()) return;
          const tile = root.querySelector(`[data-cell="${(move.from + step) % latestState.board.length}"]`);
          tile.querySelector('.tokens').append(token);
          const target = token.getBoundingClientRect();
          const dx = target.left - start.left; const dy = target.top - start.top;
          const duration = reducedMotion() ? 0 : Math.round(delay() / 2);
          if (duration > 0) {
            const animation = piece.animate([
              { transform: `translate(${from.left - start.left}px, ${from.top - start.top}px) scale(1, 1)` },
              { transform: `translate(${(from.left + target.left) / 2 - start.left}px, ${(from.top + target.top) / 2 - start.top - 20}px) scale(.95, 1.08)`, offset: .5 },
              { transform: `translate(${dx}px, ${dy}px) scale(1.08, .92)`, offset: .9 },
              { transform: `translate(${dx}px, ${dy}px) scale(1, 1)` },
            ], { duration, easing: 'ease-in-out', fill: 'forwards' });
            motionAnimations.add(animation);
            await animation.finished.catch(() => {});
            motionAnimations.delete(animation);
            if (!valid()) return;
            piece.style.transform = `translate(${dx}px, ${dy}px)`;
            animation.cancel();
          } else piece.style.transform = `translate(${dx}px, ${dy}px)`;
          from = target;
        }
      } finally {
        piece.remove();
        token.style.visibility = '';
      }
    },
  };
}
