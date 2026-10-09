import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createGame, dispatch, currentPlayer, Phase } from '../../src/core/game.js';
import { exportSave } from '../../src/core/save.js';
import { playToFinish } from './helpers.js';

const url = pathToFileURL(resolve('dist/三国大富翁.html')).href;
async function upload(page, state) {
  await page.locator('#import-save').setInputFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(exportSave(state)) });
  await expect(page.locator('#import-confirm')).toBeVisible();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
}
async function downloadState(page) {
  const promise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出存档', exact: true }).click();
  const download = await promise;
  return JSON.parse(await readFile(await download.path(), 'utf8')).state;
}
function enemyLanding({ cash = 1800, shield = false, owned = false } = {}) {
  const state = createGame(); const actor = currentPlayer(state);
  actor.cash = cash;
  if (shield) actor.cards = ['rentShield'];
  if (owned) Object.assign(state.board[3], { ownerId: actor.id, level: 2, investment: 263 });
  Object.assign(state.board[1], { ownerId: state.order[1], level: 1, investment: 150 });
  state.phase = Phase.MOVING; state.dice = 1; state.rollCount = 1;
  state.move = { from: 0, steps: 1, target: 1, laps: 0 };
  return dispatch(state, { type: 'FINISH_MOVE', actorId: actor.id, revision: 0 }).state;
}

test('JSON download, invalid imports, cancellation and escaped logs preserve the current game', async ({ page, context }) => {
  await context.setOffline(true); await page.goto(url);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const before = await downloadState(page);
  await page.locator('#import-save').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await expect(page.getByRole('alert')).toContainText('当前对局保持不变');
  expect(await downloadState(page)).toEqual(before);
  await page.locator('#import-save').setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(exportSave(before)) });
  await expect(page.locator('#import-confirm')).toBeVisible();
  await page.getByRole('button', { name: '取消导入', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await downloadState(page)).toEqual(before);
  const restored = structuredClone(before);
  restored.log.push('<img src="https://example.com/fake" onerror="document.title=123">');
  await upload(page, restored);
  await expect(page.locator('#log')).toContainText('<img src=');
  await expect(page.locator('#log img')).toHaveCount(0);
});

test('shield precedes rent and a sale has explicit confirmation and exact 60% recovery', async ({ page, context }) => {
  await context.setOffline(true); await page.goto(url); await page.locator('#speed').selectOption('instant');
  await upload(page, enemyLanding({ shield: true }));
  await expect(page.locator('#actions')).toContainText('尚未扣款');
  await page.getByRole('button', { name: '使用空城计，免除本次租金', exact: true }).click();
  const shielded = await downloadState(page);
  expect(currentPlayer(shielded).cash).toBe(1800);
  expect(currentPlayer(shielded).cards).toEqual([]);
  await upload(page, enemyLanding({ cash: 5, owned: true }));
  await page.getByRole('button', { name: '出售 长社（回收 157 金）', exact: true }).click();
  let pending = await downloadState(page);
  expect(pending.board[3].ownerId).toBe(currentPlayer(pending).id);
  await page.getByRole('button', { name: '取消出售', exact: true }).click();
  await page.getByRole('button', { name: '出售 长社（回收 157 金）', exact: true }).click();
  await page.getByRole('button', { name: '确认出售', exact: true }).click();
  pending = await downloadState(page);
  expect(currentPlayer(pending).cash).toBe(139);
  expect(pending.board[3]).toMatchObject({ ownerId: null, level: 0, investment: 0 });
  expect(pending.debt).toBeNull();
});

test('normal motion, fast motion and speed changes produce identical restored state', async ({ page, context }) => {
  await context.setOffline(true); await page.goto(url);
  const initial = createGame();
  const moving = dispatch(initial, { type: 'ROLL', actorId: currentPlayer(initial).id, revision: 0 }).state;
  await page.locator('#speed').selectOption('normal');
  await upload(page, moving);
  await expect(page.getByRole('status')).toContainText('回合结束');
  const normal = await downloadState(page);
  await upload(page, moving);
  await page.locator('#speed').selectOption('fast');
  await page.locator('#speed').selectOption('instant');
  await expect(page.getByRole('status')).toContainText('回合结束');
  expect(await downloadState(page)).toEqual(normal);
  await page.getByRole('button', { name: '玩法说明', exact: true }).click();
  await expect(page.locator('#help')).toBeVisible();
  await page.getByRole('button', { name: '关闭说明', exact: true }).click();
  await page.getByRole('button', { name: '音效：关闭', exact: true }).click();
  await expect(page.getByRole('button', { name: '音效：开启', exact: true })).toBeVisible();
});

test('a full offline classic compact match ends by bankruptcy rather than a round cap', async ({ page, context }, testInfo) => {
  test.setTimeout(180000);
  const errors = []; const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await context.setOffline(true); await page.goto(url);
  await page.getByRole('button', { name: '新局设置', exact: true }).click();
  await page.locator('select[name="mode"]').selectOption('classic');
  await page.locator('select[name="economy"]').selectOption('compact');
  await page.locator('input[name="seed"]').fill('验收-classic-compact-0');
  await page.getByRole('button', { name: '开始新局', exact: true }).click();
  await page.locator('#speed').selectOption('instant');
  await playToFinish(page, 3000);
  await expect(page.locator('#result')).toContainText('仅剩一名存活角色');
  const saved = await downloadState(page);
  expect(saved.mode).toBe('classic');
  expect(saved.players.filter((p) => p.alive)).toHaveLength(1);
  expect(saved.completedRounds).toBeGreaterThan(40);
  expect(saved.debt).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('completed-classic.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect(requests.filter((request) => request !== url && !request.startsWith('data:') && !request.startsWith('blob:'))).toEqual([]);
  console.log(`Classic offline completion: ${saved.completedRounds} complete rounds; ${saved.players.find((p) => p.alive).name} survives.`);
});
