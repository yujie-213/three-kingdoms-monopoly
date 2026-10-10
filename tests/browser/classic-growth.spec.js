import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createGame, currentPlayer, dispatch } from '../../src/core/game.js';
import { exportSave } from '../../src/core/save.js';
import { AUTO_SAVE_KEY } from '../../src/core/auto-save.js';

const url = pathToFileURL(resolve('dist/三国大富翁.html')).href;
async function upload(page, state) {
  await page.locator('#import-save').setInputFiles({ name: 'growth.json', mimeType: 'application/json', buffer: Buffer.from(exportSave(state)) });
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
}
async function download(page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出存档', exact: true }).click();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8')).state;
}
function fixture() {
  const s = createGame({ seed: '三国-1' });
  const human = currentPlayer(s);
  for (const index of [1, 3, 4]) Object.assign(s.board[index], { ownerId: human.id, level: 1, investment: s.config.landPrices[s.board[index].tier] });
  return s;
}

test('opens in classic; remote construction, discount and shop persist across reload', async ({ page, context }, testInfo) => {
  await context.setOffline(true); await page.setViewportSize({ width: 1366, height: 768 }); await page.goto(url);
  await expect(page.getByRole('status')).toContainText('经典');
  await page.getByRole('button', { name: '新局设置', exact: true }).click();
  await expect(page.locator('[name="mode"]')).toHaveValue('classic');
  await page.getByRole('button', { name: '返回对局', exact: true }).click();
  const s = fixture(); currentPlayer(s).cards = ['repair', 'commerce'];
  s.config.diceSides = 1; s.config.diceAdjustEnabled = false; currentPlayer(s).position = 12;
  await upload(page, s);
  await page.getByRole('button', { name: '使用 修城令', exact: true }).click();
  await expect(page.getByRole('button', { name: '使用 商路兴盛', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '我的城池', exact: true }).click();
  const estates = page.locator('#estate-dialog');
  await expect(estates).toContainText('颍川城组');
  await estates.getByRole('button', { name: '建设 长社', exact: true }).click();
  await expect(estates).toContainText('本回合已建设一次');
  await expect(estates.getByRole('button', { name: '建设 颍阴', exact: true })).toBeDisabled();
  await expect(estates.getByRole('button', { name: '免费领取随机锦囊', exact: true })).toBeDisabled();
  await estates.getByRole('button', { name: '返回棋盘', exact: true }).click();
  await page.locator('#speed').selectOption('instant');
  await page.getByRole('button', { name: '掷骰子', exact: true }).click();
  await expect(page.getByRole('button', { name: '前往锦囊铺', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '前往锦囊铺', exact: true }).click();
  const offer = await estates.locator('[data-action=BUY_CARD]').getAttribute('data-card');
  await estates.locator('[data-action=BUY_CARD]').click();
  await expect(estates.getByRole('button', { name: '免费领取随机锦囊', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('estates-and-shop.png') });
  await estates.getByRole('button', { name: '返回棋盘', exact: true }).click();
  const before = await download(page);
  expect(before.board[3]).toMatchObject({ level: 2, investment: 195, discountedLevels: [2] });
  expect(before.upgradeUsed).toBe(true); expect(before.shopUsed).toBe(true);
  expect(before.players.find((p) => p.human).cards).toEqual(['commerce', offer]);
  await page.reload();
  await expect(page.getByRole('status')).toContainText('经典');
  expect(await download(page)).toEqual(before);
  await page.getByRole('button', { name: '我的城池', exact: true }).click();
  await expect(estates.getByRole('button', { name: '建设 长社', exact: true })).toBeDisabled();
});

test('commerce only offers owned cities and expires without altering anyone else', async ({ page, context }) => {
  await context.setOffline(true); await page.goto(url);
  const s = fixture(); currentPlayer(s).cards = ['commerce'];
  Object.assign(s.board[6], { ownerId: s.order[1], level: 1, investment: 400 });
  await upload(page, s);
  await page.getByRole('button', { name: '使用 商路兴盛', exact: true }).click();
  const estates = page.locator('#estate-dialog');
  await expect(estates.getByRole('button', { name: '兴盛 洛阳', exact: true })).toHaveCount(0);
  await estates.getByRole('button', { name: '兴盛 颍阴', exact: true }).click();
  await estates.getByRole('button', { name: '返回棋盘', exact: true }).click();
  const boosted = await download(page);
  expect(boosted.board[1].tradeUntilRound).toBe(4);
  expect(boosted.board[6]).toEqual(s.board[6]);
  boosted.round = 4; boosted.completedRounds = 3;
  await upload(page, boosted);
  await page.getByRole('button', { name: '我的城池', exact: true }).click();
  await expect(estates.locator('.estate-item').first()).toContainText('当前租金 20 金');
});

test('an automatically saved pending move resolves once on opening', async ({ page, context }) => {
  await context.setOffline(true);
  const initial = createGame({ seed: '三国-1', config: { diceSides: 1 } });
  currentPlayer(initial).position = 39;
  const moving = dispatch(initial, { type: 'ROLL', actorId: currentPlayer(initial).id, revision: 0 }).state;
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: AUTO_SAVE_KEY, value: exportSave(moving) });
  await page.goto(url); await page.locator('#speed').selectOption('instant');
  await expect(page.getByRole('status')).toContainText('回合结束');
  const restored = await download(page);
  expect(currentPlayer(restored).cash).toBe(3325);
  expect(currentPlayer(restored).laps).toBe(1);
  expect(restored.revision).toBe(moving.revision + 1);
});

test('blocked automatic storage leaves the game usable and offers JSON backup', async ({ page, context }) => {
  await context.setOffline(true);
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }));
  await page.goto(url);
  await expect(page.locator('#save-status')).toContainText('自动保存不可用');
  await page.getByRole('button', { name: '新局设置', exact: true }).click();
  await page.getByRole('button', { name: '开始新局', exact: true }).click();
  const state = await download(page);
  expect(state.mode).toBe('classic'); expect(errors).toEqual([]);
});

test('two damaged autosaves pause the game and retain the original data', async ({ page, context }) => {
  await context.setOffline(true);
  await page.addInitScript((key) => { localStorage.setItem(key, '{broken'); localStorage.setItem(`${key}.backup`, '{broken-backup'); }, AUTO_SAVE_KEY);
  await page.goto(url);
  await expect(page.getByRole('button', { name: '继续', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('alert')).toContainText('保留原档');
  expect(await page.evaluate((key) => localStorage.getItem(key), AUTO_SAVE_KEY)).toBe('{broken');
  expect(await page.evaluate((key) => localStorage.getItem(`${key}.backup`), AUTO_SAVE_KEY)).toBe('{broken-backup');
});
