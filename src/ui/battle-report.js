import { assets, ranking, Phase } from '../core/game.js';

const escape = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const number = (value) => value.toLocaleString('zh-CN');

export function reportSummary(state) {
  const human = state.players.find((player) => player.human);
  const ended = state.phase === Phase.GAME_OVER;
  const rows = ranking(state);
  const leaders = rows.filter((row) => row.rank === 1);
  const won = ended && leaders.some((row) => row.id === human.id);
  const tied = won && leaders.length > 1;
  return { human, ended, rows, won, tied,
    title: won ? tied ? '并列领先' : '富甲三国' : '来日再战',
    status: won ? tied ? '你并列赢得本局' : '你赢得了本局' : !human.alive ? '你已破产出局' : '本局未能夺魁',
    reason: ended ? `${state.endReason} ${!won ? `本局胜者：${leaders.map((row) => row.name).join('、')}。` : ''}`
      : `${state.players.filter((player) => player.alive).map((player) => player.name).join('、')}仍在争夺天下，本局尚未结束。` };
}

export function battleReportMarkup(state, wealthChart) {
  const { human, ended, rows, won, tied, title, status, reason } = reportSummary(state);
  const holding = assets(state, human.id);
  const report = human.battleReport;
  const defeat = report.defeat;
  const moments = report.moments.filter((m) => m.key !== 'exit').sort((a, b) => a.round - b.round);
  // Keep two personal turning points and reserve the final slot for the actual outcome.
  const highlights = moments.length > 2 ? [moments[0], moments.at(-1)] : moments;
  const exit = report.moments.find((m) => m.key === 'exit');
  if (exit) highlights.push(exit);
  else if (ended) highlights.push({ round: state.round, title: won ? tied ? '并列赢得本局' : '赢得本局' : '对局结束', detail: reason });
  const metric = (label, value, unit, note) => `<article class="report-metric"><span>${label}</span><strong>${number(value)} <small>${unit}</small></strong><p>${note}</p></article>`;
  return `<header class="report-ribbon"><span>三国大富翁 / ${ended ? '终局' : '出局'}战报</span><span>${state.mode === 'classic' ? '经典模式' : '限轮模式'} · 第 ${state.round} 轮</span><button type="button" data-report="close" aria-label="收起战报">×</button></header>
    <div class="report-hero ${won ? 'victory' : 'defeat'}"><span class="report-seal">${won ? tied ? '并 列' : '胜 战' : '败 战'}</span><h2 id="result-title">${title}</h2><p>${human.name} · ${state.players.find((p) => p.id === human.id).factionId === 'shu' ? '蜀' : human.factionId === 'wei' ? '魏' : '吴'}　｜　${status}</p><p class="report-reason">${escape(reason)}${ended ? ` 已完成 ${state.completedRounds} 轮。` : ''}</p></div>
    <div class="report-body"><div class="report-metrics">
      ${won ? metric('终局总资产', holding.total, '金', `现金 ${number(holding.cash)} + 实际投入 ${number(holding.investment)}`) : metric('本局资产峰值', human.stats.peakAssets, '金', '留下你曾经经营的成绩')}
      ${metric('累计收租', human.stats.rentCollected, '金', `最高单笔 ${number(human.stats.largestRent)} 金`)}
      ${won ? metric('终局城池', holding.count, '座', `其中三级城池 ${holding.maxLevelCount} 座`) : metric('本局购地', human.stats.purchases, '次', `累计建设 ${human.stats.upgrades} 次`)}
    </div>
    ${defeat ? `<section class="report-cause"><strong>败于${escape(state.board.find((tile) => tile.id === defeat.tileId)?.name || defeat.reason)} · 无法清偿 ${number(defeat.amount)} 金欠款</strong><p>第 ${defeat.round} 轮破产判定时：现金 ${number(defeat.cash)} 金 + 全部城产可回收 ${number(defeat.recovery)} 金 = ${number(defeat.cash + defeat.recovery)} 金，仍差 ${number(defeat.shortfall)} 金。</p></section>` : !human.alive ? '<p class="report-legacy">旧存档未记录破产时的资产明细，可在对局日志中查看当时的欠款。</p>' : ''}
    <h3 class="report-chapter">${won ? '这一局，如何赢下来的' : '你的本局征程'}</h3><div class="report-moments">${highlights.map((moment) => `<article><small>第 ${moment.round} 轮</small><strong>${escape(moment.title)}</strong><p>${escape(moment.detail)}</p></article>`).join('') || '<p class="report-legacy">尚无关键事件记录；旧存档从本次恢复后开始记录。</p>'}</div>
    <details class="report-details"><summary>${ended ? '展开三方战报与资产明细' : '展开个人复盘与场上局势'}</summary>
      <div class="report-table-wrap"><table><thead><tr>${ended ? '<th>名次</th>' : ''}<th>角色</th><th>状态</th><th>总资产</th><th>资产峰值</th><th>累计收租</th></tr></thead><tbody>${rows.map((p) => `<tr class="${p.human ? 'report-you' : ''}">${ended ? `<td>${p.rank}</td>` : ''}<td>${p.name}${p.human ? ' · 你' : ''}</td><td>${!p.alive ? '已破产' : !ended ? '继续对局' : p.rank === 1 ? '获胜' : '存活'}</td><td>${number(p.total)}</td><td>${number(p.stats.peakAssets)}</td><td>${number(p.stats.rentCollected)}</td></tr>`).join('')}</tbody></table></div>
      <p class="report-valuation">总资产按现金 + 实际投入计算，同分并列。破产后城产归无主，终局资产归零，资产峰值保留。</p>
      <div class="wealth-results">${state.players.map((p) => `<article><strong>${p.name} · 资产峰值 ${number(p.stats.peakAssets)} 金</strong>${wealthChart(p)}<p>买地 ${p.stats.purchases} 次 · 建设 ${p.stats.upgrades} 次<br>现金 ${number(p.cash)} 金 · 城产投入 ${number(assets(state, p.id).investment)} 金</p><p>${p.stats.milestones.map(escape).join(' · ') || '本局未达到里程碑'}</p></article>`).join('')}</div>
      <details class="summary-events"><summary>本局关键事件摘要（最近 30 条）</summary><ol>${state.log.filter((text) => /破产|事件抽签|出售|使用.*空城计/.test(text)).slice(-30).map((text) => `<li>${escape(text)}</li>`).join('') || '<li>暂无事件</li>'}</ol></details>
    </details></div>
    <footer class="report-footer"><span>${won ? '天下已定，下一局换一种经营之道。' : '胜败有时，再起有路。'}</span><div><button type="button" data-report="close">${ended ? '查看终局棋盘' : '继续观战'}</button><button type="button" class="report-primary" data-report="restart">${won ? '再战一局' : '重新开局'}</button></div></footer>`;
}
