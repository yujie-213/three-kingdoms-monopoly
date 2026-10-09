import { currentPlayer, Phase, landPrice, rent, upgradeCost, assets, ranking } from '../core/game.js';
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
const tierNames = { village: '县城', county: '郡治', capital: '名城' };
const factionName = (id) => factions.find((faction) => faction.id === id).name;
const facilityIndex = (tile) => tile.type === 'start' ? 0 : tile.type === 'event' ? 4 : ({ inn: 1, card: 2, marketTax: 3, advice: 5, redCliff: 6 }[tile.effect] ?? 5);
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const propPosition = (index) => `--prop-x:${index % 5 * 25}%;--prop-y:${Math.floor(index / 5) * 100}%`;
const cardIcon = (card) => `<span class="card-art" aria-hidden="true" style="--card-x:${{ rentShield: 0, stride: 50, fortune: 100 }[card]}%"></span>`;
// Put the result on top, then tilt the whole cube toward the viewer.
const diceRotations = ['rotateX(90deg)', 'rotateZ(-90deg)', '', 'rotateX(180deg)', 'rotateZ(90deg)', 'rotateX(-90deg)']
  .map((orientation) => `rotateX(-52deg) rotateY(-24deg) ${orientation}`.trim());
const diceArtwork = (value) => {
  const pips = [[5], [1, 9], [1, 5, 9], [1, 3, 7, 9], [1, 3, 5, 7, 9], [1, 3, 4, 6, 7, 9]];
  return `<div class="dice-cube" style="--die-rotation:${diceRotations[(value || 1) - 1] || diceRotations[0]}" aria-hidden="true">${pips.map((dots, index) => `<span class="dice-face face-${index + 1}">${dots.map((position) => `<i class="dice-pip" style="grid-row:${Math.ceil(position / 3)};grid-column:${(position - 1) % 3 + 1}"></i>`).join('')}</span>`).join('')}</div>`;
};
const tokenContent = (player) => `<span class="token-art ${player.portraitKey}" aria-hidden="true"></span><span class="token-faction">${factionName(player.factionId)}</span>`;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createView(root, onCommand, onStart, onSpeed, { onExport, onImport, onConfirmImport, onCancelImport, onPause, onSound } = {}) {
  root.innerHTML = `<header class="topbar"><h1><img class="game-title" src="${titleArt}" alt="三国大富翁"></h1><div id="turn-status" role="status"></div>
    <nav class="toolbar" aria-label="对局工具"><button id="setup-button" type="button">新局设置</button><button id="export-save" type="button">导出存档</button><label class="file-button">导入存档<input id="import-save" type="file" accept=".json,application/json"></label>
    <button id="pause" type="button" aria-pressed="false">暂停</button><button id="sound" type="button" aria-pressed="false">音效：关闭</button><button id="help-button" type="button">玩法说明</button></nav></header>
    <dialog id="setup-dialog"><h2>开始新局</h2><form id="setup"><label>你的阵营 <select name="factionId">${factions.map((faction) => `<option value="${faction.id}">${faction.name}</option>`).join('')}</select></label>
    <label>阵营主将 <select name="humanId"></select></label>
    <label>终局模式 <select name="mode"><option value="rounds">限轮 · 40 轮</option><option value="classic">经典 · 最后一人</option></select></label>
    <label>经济预设 <select name="economy"><option value="standard">标准 · 1800 / 500</option><option value="compact">紧张资金 · 500 / 80</option></select></label>
    <label>随机种子 <input name="seed" value="三国-1" maxlength="80" required></label><p class="prototype-note">魏·曹操 / 蜀·刘备 / 吴·孙权 · 40格行旅 · 存档请手动导出</p><div class="dialog-actions"><button type="submit">开始新局</button><button id="cancel-setup" type="button">返回对局</button></div></form></dialog>
    <section id="import-confirm" class="card" hidden><h2>确认导入存档</h2><p id="import-summary"></p><p>确认后替换当前对局；取消会继续原局。</p><button id="confirm-import" type="button">确认导入</button><button id="cancel-import" type="button">取消导入</button></section>
    <dialog id="help"><h2>行军与经营</h2><p>魏、蜀、吴三方各一位主将同起点。标准经济每人1800金，一圈500金。掷一颗六面骰，顺时针走过40格；经过土地不收费，仅结算落点。</p>
    <p>环路分中原、荆襄、江东、巴蜀四段，使用汉末至三国地名。县城、郡治、名城是游戏经济等级；州郡县关系见地块详情。线路是主题行旅，地理区域不代表固定阵营归属。魏以曹操为首版代表主将。</p>
    <p>无主地可购买或放弃，购地立即得到一级建筑；停到自己的地可付费升一级，最多三级。本次购入后不能立即升级。停在敌地先询问空城计，再收租。</p>
    <p>欠款先卖地筹钱，回收实际投入的 60% 向下取整，土地与建筑整体归还系统；仍无法偿还才破产。出售前需确认。</p>
    <p>空城计免本次租金；千里走单骑在掷骰前让移动 +2；生财有道在掷骰前 +100 金。背包最多三张，满时可替换或放弃。</p>
    <p>事件有奖罚、急行军、军令延误和赠锦囊。每回合最多一次额外骰；跳过仍计行动机会。设施/主题格详情可点击查看。</p>
    <p>限轮模式默认40个完整轮，资产=现金+实际投入，同分并列；经典模式只剩一人结束，标准经济可能持续很久。紧张资金预设为500 / 80金。AI 不知未来随机结果，快进不改账。刷新不会自动保存，导出 JSON 后可离线恢复。本版存档v3，旧版24格存档无法恢复。</p>
    <p>费用、估值、格子分布为首版实验参数；没有联机和账号。原创素材与提示音不需要网络。</p><form method="dialog"><button>关闭说明</button></form></dialog>
    <div class="game-layout"><aside class="players-column" aria-label="玩家与记录"><section class="card players-panel"><h2>三方势力</h2><div id="players"></div></section>
    <section class="card log-panel"><p id="latest-log"></p><details class="log-history" open><summary>对局记录</summary><ol id="log"></ol></details></section></aside>
    <section class="map-panel" aria-label="40 格环路地图"><div id="board" class="board" style="--board-columns:${boardLayout.columns};--board-rows:${boardLayout.rows}"></div></section>
    <aside class="operations-column" aria-label="操作与土地详情"><section class="card speed-panel">
    <label>AI / 移动速度 <select id="speed"><option value="normal">普通</option><option value="fast">快速</option><option value="instant">跳过等待</option></select></label>
    </section><section class="card" id="actions" aria-label="当前操作"></section>
    <section class="card" id="tile-info" aria-label="土地详情">点击地图格子查看信息。</section></aside></div>
    <section class="card result" id="result" hidden></section>
    <div id="feedback" aria-live="polite" aria-relevant="additions" aria-label="对局动态"></div><p id="message" role="alert"></p>
    <div id="card-tooltip" class="card-tooltip" role="tooltip" hidden></div>`;
  // Direct shared rules avoid both repeated large URLs and browser size limits
  // on CSS custom-property values. The images remain embedded and offline.
  const artStyle = document.createElement('style');
  artStyle.textContent = `.portrait{background-image:url("${portraitArt}")}.token-art{background-image:url("${pawnArt}")}.building-art{background-image:url("${buildingArt}")}.facility-art{background-image:url("${facilityArt}")}.card-art{background-image:url("${cardArt}")}.dice-backdrop{background-image:url("${diceStageArt}")}`;
  root.append(artStyle);
  const boardElement = root.querySelector('#board');
  boardElement.innerHTML = `<div class="map-center"><img class="scene-art" src="${sceneArt}" alt="" aria-hidden="true"><span class="landscape-label central">中原</span><span class="landscape-label jing">荆襄</span><span class="landscape-label east">江东</span><span class="landscape-label west">巴蜀</span><div class="map-caption"></div><div class="ownership-legend"><span class="unowned">无主</span><span class="wei">魏</span><span class="shu">蜀</span><span class="wu">吴</span></div></div>`;
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
    onStart({ humanId: form.get('humanId'), seed: form.get('seed'), mode: form.get('mode'), economy: form.get('economy') });
    root.querySelector('#setup-dialog').close();
  });
  root.querySelector('#setup-button').addEventListener('click', () => root.querySelector('#setup-dialog').showModal());
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
    return cards[card].description;
  }
  root.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-cell]');
    if (tile) { selectedIndex = Number(tile.dataset.cell); details(true); }
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    if (button.dataset.action === 'PREPARE_SELL') { pendingSale = button.dataset.tile; render(latestState); return; }
    if (button.dataset.action === 'CANCEL_SELL') { pendingSale = null; render(latestState); return; }
    const command = { type: button.dataset.action, actorId: currentPlayer(latestState).id,
      revision: Number(button.dataset.revision), tileId: button.dataset.tile, card: button.dataset.card,
      replaceIndex: Number(button.dataset.replace) };
    pendingSale = null;
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
      <p class="administration">${tile.province} · ${tile.commandery} · ${tile.county}</p>` : `<p>${tile.type === 'start' ? '完成一圈领取 ' + latestState.config.salaryPerLap + ' 金' : tile.type === 'event' ? '抽取经济、行动或策略事件' : ({ inn: '补给 +' + latestState.config.facilityAmounts.inn + ' 金', marketTax: '税费 ' + latestState.config.facilityAmounts.marketTax + ' 金', card: '随机获得锦囊', advice: '获得空城计', redCliff: '补给 +' + latestState.config.facilityAmounts.redCliff + ' 金' }[tile.effect] || '主题地点')}</p>`}
      <details class="history"><summary>历史与地点</summary><p>${tile.history}</p></details></details>`;
    root.querySelectorAll('.tile.selected').forEach((button) => button.classList.remove('selected'));
    root.querySelector('[data-cell="' + selectedIndex + '"]')?.classList.add('selected');
  }
  function actionButton(type, label, disabled = false, tileId = '', card = '', replaceIndex = -1) {
    return `<button type="button" data-action="${type}" data-revision="${latestState.revision}" data-tile="${tileId}" data-card="${card}" data-replace="${replaceIndex}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  }
  function render(state, events = []) {
    cancelMotion();
    hideCardTooltip();
    const previous = latestState;
    latestState = state;
    const player = currentPlayer(state);
    root.querySelector('.prototype-note').textContent = `初始现金 ${state.config.initialCash} 金 · 圈俸禄 ${state.config.salaryPerLap} 金 · 仅落点结算 · 背包 ${state.config.cardCapacity} 张 · 记得手动导出存档`;
    root.querySelector('#turn-status').textContent = `第 ${state.round}${state.mode === 'rounds' ? ` / ${state.config.defaultRoundLimit}` : ' · 经典'} 轮 · ${player.name}（${player.human ? '玩家' : 'AI'}）· ${phaseNames[state.phase]} · 骰点 ${state.dice ?? '—'}`;
    root.querySelector('#players').innerHTML = state.players.map((p) => {
      const value = assets(state, p.id);
      return `<div class="player ${p.factionId} ${p.id === player.id ? 'active' : ''} ${p.alive ? '' : 'eliminated'}" title="${p.human ? '玩家' : p.aiStyle === 'conservative' ? '保守 AI' : '激进 AI'}">
      <div class="player-heading"><span class="portrait ${p.portraitKey}" role="img" aria-label="${p.name}Q版肖像"></span><strong>${factionName(p.factionId)} · ${p.name}${p.human ? '（你）' : '（AI）'}${p.alive ? '' : ' · 已破产'}</strong></div>
      <p class="player-cash">现金 <b>${p.cash}</b></p><p class="player-assets">总资产 ${value.total}</p>
      <details class="player-details"><summary>土地 ${value.count} · 锦囊 ${p.cards.length}${p.skipTurns ? ' · 待跳过' : ''}</summary><p>投入 ${value.investment} · 已行 ${p.laps} 圈</p><div class="card-list">${p.cards.map((card) => '<span class="mini-card" role="img" tabindex="0" data-card-info="' + card + '" aria-label="' + cards[card].name + '">' + cardIcon(card) + '</span>').join('') || '无锦囊'}</div></details></div>`;

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
        ${tile.type === 'land' ? `<i class="building-art ${tile.tier} level-${tile.level} ${tile.level ? 'built' : ''}" aria-hidden="true"></i>${owner ? '<i class="ownership-flag" aria-label="' + factionName(owner.factionId) + '占领">' + factionName(owner.factionId) + '</i><span class="level-badge" aria-label="建筑' + tile.level + '级">' + ['','Ⅰ','Ⅱ','Ⅲ'][tile.level] + '</span>' : ''}` : `<i class="facility-art" style="${propPosition(facilityIndex(tile))}" aria-hidden="true"></i>`}<strong>${tile.name}</strong>
        <div class="tokens">${state.players.filter((p) => p.alive && p.position === index).map((p) => '<b class="token ' + p.factionId + '" data-player="' + p.id + '" aria-label="' + p.name + '，' + factionName(p.factionId) + '国">' + tokenContent(p) + '</b>').join('')}</div></button>`;
    }).join(''));
    const action = root.querySelector('#actions');
    action.dataset.phase = state.phase;
    const tile = state.board[player.position];
    action.innerHTML = `<div class="action-heading"><h2>${phaseNames[state.phase]}</h2><span class="dice-caption">${state.dice ? `本次掷出 ${state.dice} 点` : '等待掷骰'}</span></div><div class="dice-stage"><div class="dice-table"><div class="dice-backdrop" aria-hidden="true"></div><div class="dice-plinth" aria-hidden="true"></div><div class="dice-shadow" aria-hidden="true"></div><div class="dice-pivot"><div class="turn-dice" aria-label="骰点${state.dice || '未掷'}">${diceArtwork(state.dice)}</div></div></div></div>`;
    if (state.phase === Phase.GAME_OVER) action.innerHTML += '<p>对局结束。可以开始新局。</p>';
    else if (!player.human || state.phase === Phase.MOVING) action.innerHTML += `<p class="waiting-note">${player.name}行军中…</p>`;
    else if (state.phase === Phase.TURN_START) {
      action.innerHTML += actionButton('ROLL', '掷骰子') + (player.moveBonus ? `<p>千里走单骑：本次移动额外 +${player.moveBonus} 格。</p>` : '');
      let hand = `<div class="inventory"><h3>我的锦囊 ${player.cards.length} / ${state.config.cardCapacity}</h3>`;
      hand += '<div class="card-hand">';
      for (const card of player.cards) {
        const hint = cardDescription(card);
        hand += card === 'rentShield' ? '<span class="card-token" role="img" tabindex="0" data-card-info="' + card + '" aria-label="空城计：' + hint + '">' + cardIcon(card) + '<span>空城计</span></span>' : actionButton('USE_CARD', '使用 ' + cards[card].name, card === 'stride' && Boolean(player.moveBonus), '', card).replace('<button ', '<button class="card-use" data-card-info="' + card + '" aria-label="使用 ' + cards[card].name + '" ').replace('>使用 ' + cards[card].name + '</button>', '>' + cardIcon(card) + '<span>' + cards[card].name + '</span></button>');
      }
      if (!player.cards.length) hand += '<span class="empty-hand">暂无锦囊</span>';
      action.innerHTML += hand + '</div></div>';
    }
    else if (state.phase === Phase.EXTRA_ROLL) action.innerHTML += '<p>急行军使本回合额外行动一次；重复事件不会连锁。</p>' + actionButton('ROLL', '额外掷骰子');
    else if (state.phase === Phase.TURN_END) action.innerHTML += actionButton('END_TURN', '结束回合');
    else if (state.phase === Phase.BUY_DECISION || state.phase === Phase.UPGRADE_DECISION) {
      const buying = state.phase === Phase.BUY_DECISION;
      const cost = buying ? landPrice(state, tile) : upgradeCost(state, tile);
      action.innerHTML += `<div class="decision-summary"><p><strong>${tile.name}</strong> · ${buying ? '含一级建筑' : `${tile.level} → ${tile.level + 1}级`}</p><dl class="decision-costs"><div><dt>费用</dt><dd>${cost} 金</dd></div><div><dt>当前现金</dt><dd>${player.cash} 金</dd></div><div><dt>操作后余额</dt><dd>${player.cash - cost} 金</dd></div><div><dt>租金</dt><dd>${buying ? '0' : rent(state, tile)} → ${rent(state, tile, buying ? 1 : tile.level + 1)} 金</dd></div></dl></div>`;
      action.innerHTML += '<div class="decision-buttons">' + actionButton(buying ? 'BUY' : 'UPGRADE', buying ? '确认购买' : '确认升级', player.cash < cost) + actionButton('PASS', '放弃') + '</div>';
      if (player.cash < cost) action.innerHTML += '<p>现金不足，无法确认。</p>';
    } else if (state.phase === Phase.DEBT_RESOLUTION) {
      const holding = assets(state, player.id);
      action.innerHTML += `<p>${escapeHtml(state.debt.reason)} · 应付 ${state.debt.amount} 金 · 当前现金 ${player.cash} 金<br>可回收资产 ${holding.recovery} 金，欠款处理期间禁止掷骰。</p>`;
      const holdings = state.board.filter((item) => item.ownerId === player.id);
      if (pendingSale) {
        const land = holdings.find((item) => item.id === pendingSale);
        action.innerHTML += `<p>确认出售 ${land.name} 及建筑，回收 ${Math.floor(land.investment * state.config.assetSellbackRatio)} 金？出售后不可撤销。</p><div class="decision-buttons">` + actionButton('SELL', '确认出售', false, pendingSale) + actionButton('CANCEL_SELL', '取消出售') + '</div>';
      } else if (holdings.length) {
        const land = holdings.find((item) => item.id === selectedSaleId) || holdings[0];
        if (holdings.length > 1) action.innerHTML += `<label class="sale-picker">选择要出售的城池<select id="sale-land">${holdings.map((item) => `<option value="${item.id}" ${item.id === land.id ? 'selected' : ''}>${item.name} · 回收 ${Math.floor(item.investment * state.config.assetSellbackRatio)} 金</option>`).join('')}</select></label>`;
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
    const result = root.querySelector('#result');
    result.hidden = state.phase !== Phase.GAME_OVER;
    if (!result.hidden) result.innerHTML = `<h2>对局结算</h2><p>${escapeHtml(state.endReason)} 已完成 ${state.completedRounds} 轮。总资产按现金 + 实际投入，同分并列。</p>
      <table><thead><tr><th>名次</th><th>角色</th><th>现金</th><th>土地</th><th>购地价值</th><th>升级投入</th><th>可回收</th><th>总资产</th><th>圈数</th></tr></thead><tbody>${ranking(state).map((p) => `<tr><td>${p.rank}</td><td>${p.name}${p.alive ? '' : '（破产）'}</td><td>${p.cash}</td><td>${p.count}</td><td>${p.landValue}</td><td>${p.buildingValue}</td><td>${p.recovery}</td><td>${p.total}</td><td>${p.laps}</td></tr>`).join('')}</tbody></table>
      <details class="summary-events"><summary>本局关键事件摘要（最近 30 条）</summary><ol>${state.log.filter((text) => /破产|事件抽签|领取.*俸禄|出售|使用.*空城计/.test(text)).slice(-30).map((text) => `<li>${escapeHtml(text)}</li>`).join('') || '<li>暂无事件</li>'}</ol></details>`;
    root.querySelector('#latest-log').textContent = state.log.at(-1) || '';
    if (events.length && previous) showActivity(state, previous, events);
    root.querySelector('#log').innerHTML = state.log.slice(-10).reverse().map((message) => `<li>${escapeHtml(message)}</li>`).join('');
    details();
  }
  return { render, cancelMotion, message(text) { root.querySelector('#message').textContent = text; },
    confirmImport(state) { root.querySelector('#import-summary').textContent = `模式：${state.mode === 'classic' ? '经典' : '限轮'}；第 ${state.round} 轮；${phaseNames[state.phase]}。`; root.querySelector('#import-confirm').hidden = false; },
    hideImport() { root.querySelector('#import-confirm').hidden = true; },
    paused(value) { const button = root.querySelector('#pause'); button.textContent = value ? '继续' : '暂停'; button.setAttribute('aria-pressed', String(value)); root.querySelector('#actions').inert = value; },
    sound(value) { const button = root.querySelector('#sound'); button.textContent = value ? '音效：开启' : '音效：关闭'; button.setAttribute('aria-pressed', String(value)); },
    reset() { cancelMotion(); clearFeedback(); pendingSale = null; selectedSaleId = null; selectedIndex = null; latestState = null; },
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
