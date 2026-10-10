import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createGame, currentPlayer, dispatch, Phase } from '../../src/core/game.js';
import { exportSave } from '../../src/core/save.js';

const url = pathToFileURL(resolve('dist/三国大富翁.html')).href;
const act = (s, type) => dispatch(s, { type, revision: s.revision, actorId: currentPlayer(s).id }).state;
async function upload(page, state) {
  await page.locator('#import-save').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(exportSave(state)) });
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
}
function shop() {
  let s = createGame({ seed: '三国-1', config: { diceSides: 1, diceAdjustEnabled: false } });
  currentPlayer(s).position = 12;
  s = act(act(s, 'ROLL'), 'FINISH_MOVE'); s.shopOffer = 'rentShield'; return s;
}
function exit() {
  const s = createGame({ seed: '三国-1' });
  s.turnIndex = s.order.indexOf('liu'); currentPlayer(s).cash = 10;
  Object.assign(s.board[1], { ownerId: 'liu', level: 1, investment: 150 });
  s.phase = Phase.DEBT_RESOLUTION; s.debt = { amount: 120, creditorId: null, tileId: null, reason: '朝廷征税' };
  return act(s, 'BANKRUPT');
}
function victory() {
  const s = createGame({ seed: '三国-1' });
  s.players.filter((p) => !p.human).forEach((p) => { p.alive = false; p.cash = 0; });
  s.turnIndex = s.order.indexOf('liu'); s.roundRemaining = ['liu'];
  s.phase = Phase.GAME_OVER; s.endReason = '仅剩一名存活角色，赢得本局。';
  return s;
}

test('shops require a landing, show the visit limit and disable duplicate shields', async ({ page, context }) => {
  await context.setOffline(true); await page.goto(url);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '我的城池', exact: true }).click();
  await expect(page.getByRole('button', { name: '免费领取随机锦囊', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '返回棋盘', exact: true }).click();
  await upload(page, shop());
  await page.getByRole('button', { name: '前往锦囊铺', exact: true }).click();
  await expect(page.locator('#estate-content')).toContainText('已停靠隆中');
  await page.getByRole('button', { name: '购买 空城计', exact: true }).click();
  await expect(page.getByRole('button', { name: '购买 空城计', exact: true })).toBeDisabled();
  await expect(page.locator('#estate-content [data-action=BUY_CARD]')).toHaveCount(1);
  await expect(page.locator('#estate-content')).toContainText('本次已作出选择');
});

test('half-price offer survives reopening and reload, and a purchase excludes the free gift', async ({ page, context }, testInfo) => {
  await context.setOffline(true); await page.goto(url);
  const s = shop(); s.shopOffer = 'fortune';
  await upload(page, s);
  await page.getByRole('button', { name: '前往锦囊铺', exact: true }).click();
  const estates = page.locator('#estate-dialog');
  await expect(estates).toContainText('生财有道 · 五折 60 金');
  await estates.getByRole('button', { name: '返回棋盘', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '前往锦囊铺', exact: true }).click();
  await expect(estates).toContainText('生财有道 · 五折 60 金');
  await estates.screenshot({ path: testInfo.outputPath('shop-choice-desktop.png') });
  await estates.getByRole('button', { name: '购买 生财有道', exact: true }).click();
  await expect(estates.getByRole('button', { name: '免费领取随机锦囊', exact: true })).toBeDisabled();
  await estates.getByRole('button', { name: '返回棋盘', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出存档', exact: true }).click();
  const state = JSON.parse(await readFile(await (await downloaded).path(), 'utf8')).state;
  expect(currentPlayer(state).cash).toBe(currentPlayer(s).cash - 60);
  expect(currentPlayer(state).cards).toEqual(['fortune']);
  expect(state.shopUsed).toBe(true);
});

test('free full-hand choice reveals replacement outside the shop and remains consumed after decline/reload', async ({ page, context }, testInfo) => {
  await context.setOffline(true); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url);
  const s = shop(); currentPlayer(s).cards = ['rentShield', 'repair', 'fortune'];
  currentPlayer(s).cardBag = ['rentShield', 'commerce', 'stride'];
  await upload(page, s);
  await page.getByRole('button', { name: '前往锦囊铺', exact: true }).click();
  const estates = page.locator('#estate-dialog');
  await expect(estates.getByRole('button', { name: '购买 空城计', exact: true })).toBeDisabled();
  expect(await estates.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await estates.screenshot({ path: testInfo.outputPath('shop-choice-mobile.png') });
  await estates.getByRole('button', { name: '免费领取随机锦囊', exact: true }).click();
  await expect(estates).not.toBeVisible();
  await expect(page.locator('#actions')).toContainText('获得 商路兴盛，背包已满');
  await page.reload();
  await expect(page.getByRole('button', { name: '放弃新锦囊', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '放弃新锦囊', exact: true }).click();
  await page.getByRole('button', { name: '我的城池', exact: true }).click();
  await expect(estates.getByRole('button', { name: '免费领取随机锦囊', exact: true })).toBeDisabled();
  await expect(estates).toContainText('本次已作出选择');
});

for (const width of [1366, 390, 320]) {
  test(`victory and defeat reports fit at ${width}px and preserve inspection/restart/observation`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: width > 500 ? 768 : 844 });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await context.setOffline(true); await page.goto(url);
    await upload(page, victory());
    await expect(page.locator('#result-title')).toHaveText('富甲三国');
    await expect(page.locator('#result')).toContainText('你赢得了本局');
    await page.locator('#result').screenshot({ path: testInfo.outputPath(`victory-${width}.png`) });
    await expect(page.getByRole('button', { name: '再战一局', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '再战一局', exact: true }).click();
    await expect(page.locator('#setup-dialog')).toBeVisible();
    await page.getByRole('button', { name: '返回对局', exact: true }).click();
    await page.getByRole('button', { name: '查看战报', exact: true }).click();
    await page.locator('.report-details > summary').click();
    await expect(page.locator('#result tbody tr')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(page.locator('#result')).toBeHidden();
    await upload(page, exit());
    await expect(page.locator('#result-title')).toHaveText('来日再战');
    await expect(page.locator('#result')).toContainText('本局尚未结束');
    await expect(page.locator('.report-cause')).toContainText('仍差 20 金');
    await expect(page.locator('#result th').filter({ hasText: '名次' })).toHaveCount(0);
    const status = await page.locator('#turn-status').innerText();
    await page.waitForTimeout(800);
    await expect(page.locator('#turn-status')).toHaveText(status);
    await page.locator('#result').screenshot({ path: testInfo.outputPath(`defeat-${width}.png`) });
    expect(await page.locator('#result').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole('button', { name: '继续观战', exact: true }).click();
    await expect(page.locator('#result')).toBeHidden();
    await expect(page.locator('#turn-status')).not.toHaveText(status);
    expect(errors).toEqual([]);
  });
}
