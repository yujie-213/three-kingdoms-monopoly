import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createGame, currentPlayer, dispatch, Phase, groupIncome } from '../../src/core/game.js';
import { exportSave } from '../../src/core/save.js';

const url = pathToFileURL(resolve('dist/三国大富翁.html')).href;
const act = (s, type, extra = {}) => dispatch(s, { type, revision: s.revision, actorId: currentPlayer(s).id, ...extra }).state;
async function upload(page, state) {
  await page.locator('#import-save').setInputFiles({ name: 'economy.json', mimeType: 'application/json', buffer: Buffer.from(exportSave(state)) });
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
}
async function download(page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出存档', exact: true }).click();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8')).state;
}
function own(s, index, level = 1) {
  const tile = s.board[index], price = s.config.landPrices[tile.tier];
  Object.assign(tile, { ownerId: currentPlayer(s).id, level, investment: price + s.config.upgradeMultipliers.slice(0, level - 1).reduce((sum, ratio) => sum + Math.round(price * ratio), 0) });
}

test('paid routing survives refresh, shows destinations, charges once and settles the chosen landing', async ({ page, context }, testInfo) => {
  await context.setOffline(true); await page.goto(url); await page.locator('#speed').selectOption('instant');
  const before = act(createGame({ seed: '三国-1', config: { eventsEnabled: false } }), 'ROLL');
  await upload(page, before);
  await expect(page.locator('#actions')).toHaveAttribute('data-phase', 'DICE_DECISION');
  await page.reload(); await page.locator('#speed').selectOption('instant');
  expect(await download(page)).toEqual(before);
  const delta = before.dice === 6 ? -1 : 1;
  const choice = page.locator(`[data-action="ADJUST_DICE"][data-delta="${delta}"]`);
  await expect(choice).toContainText(before.board[(currentPlayer(before).position + before.dice + delta) % 40].name);
  await expect(page.locator('#actions')).toContainText('花费60金');
  await page.screenshot({ path: testInfo.outputPath('dice-routing.png') });
  await choice.click();
  await expect(page.locator('#actions')).not.toHaveAttribute('data-phase', 'MOVING');
  const expected = act(act(before, 'ADJUST_DICE', { delta }), 'FINISH_MOVE');
  expect(await download(page)).toEqual(expected);
  await page.reload();
  expect(await download(page)).toEqual(expected);
});

test('routing and reserve decisions fit desktop viewports without scrolling', async ({ page, context }) => {
  await context.setOffline(true); await page.goto(url);
  const state = act(createGame({ seed: '三国-1' }), 'ROLL');
  for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1152, height: 648 }]) {
    await page.setViewportSize(viewport); await upload(page, state);
    await expect(page.locator('#actions')).toHaveAttribute('data-phase', 'DICE_DECISION');
    expect(await page.locator('#actions').evaluate(el => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth)).toBe(true);
    for (const button of await page.locator('#actions button').all()) {
      const box = await button.boundingBox();
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height);
  }
});

test('end of the second circle pays its last segment and full groups once, then exposes the lower supply', async ({ page, context }) => {
  await context.setOffline(true); await page.goto(url); await page.locator('#speed').selectOption('instant');
  const s = createGame({ seed: '三国-1', config: { diceSides: 1, eventsEnabled: false } });
  own(s, 10); own(s, 11); own(s, 1); own(s, 3); own(s, 4);
  Object.assign(currentPlayer(s), { position: 39, laps: 1, diceAdjustUsed: true });
  await upload(page, act(s, 'ROLL'));
  await expect(page.locator('#actions')).toHaveAttribute('data-phase', 'TURN_END');
  const settled = await download(page);
  expect(currentPlayer(settled)).toMatchObject({ cash: 3525, laps: 2, diceAdjustUsed: false });
  await expect(page.locator('#economy-status')).toContainText('补给300金/圈');
  await expect(page.locator('#economy-status')).toContainText('城组200金/圈');
  await page.reload(); expect(await download(page)).toEqual(settled);
  await page.getByRole('button', { name: '我的城池', exact: true }).click();
  await expect(page.locator('#estate-content')).toContainText('当前无开拓补助');
  await expect(page.locator('#estate-content')).toContainText('本圈可用一次');
});

test('demolition requires confirmation, pays the original debt and preserves a complete group', async ({ page, context }, testInfo) => {
  await context.setOffline(true); await page.goto(url);
  const s = createGame({ seed: '三国-1' }); own(s, 10, 2); own(s, 11);
  currentPlayer(s).cash = 0; s.phase = Phase.DEBT_RESOLUTION;
  s.debt = { amount: 80, creditorId: null, reason: '税费', tileId: null };
  await upload(page, s);
  await page.getByRole('button', { name: /^拆建筑 宛县/ }).click();
  expect((await download(page)).board[10].level).toBe(2);
  await page.getByRole('button', { name: '取消拆建筑', exact: true }).click();
  await page.getByRole('button', { name: /^拆建筑 宛县/ }).click();
  await page.screenshot({ path: testInfo.outputPath('demolition-confirmation.png') });
  await page.getByRole('button', { name: '确认拆建筑', exact: true }).click();
  const settled = await download(page);
  expect(settled.board[10]).toMatchObject({ level: 1, investment: 250, ownerId: currentPlayer(s).id });
  expect(currentPlayer(settled).cash).toBe(10); expect(settled.debt).toBeNull();
  expect(groupIncome(settled, currentPlayer(settled).id)).toBe(80);
  await page.reload(); expect(await download(page)).toEqual(settled);
});

test('prosperity multiplier and next increase are public and level-three locking is explained', async ({ page, context }) => {
  await context.setOffline(true); await page.goto(url);
  const s = createGame({ seed: '三国-1' }); own(s, 4, 2);
  s.round = 26; s.completedRounds = 25; s.prosperityStartRound = 1;
  await upload(page, s);
  await expect(page.locator('#economy-status')).toContainText('租金×1.50');
  await page.getByRole('button', { name: '我的城池', exact: true }).click();
  await expect(page.locator('#estate-content')).toContainText('12个完整轮次后增加0.25');
  await expect(page.getByRole('button', { name: '建设 许县', exact: true })).toBeDisabled();
  await expect(page.locator('#estate-content')).toContainText('完成第一圈后解锁');
});
