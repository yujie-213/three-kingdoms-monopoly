import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGame, dispatch, currentPlayer, Phase, landPrice, upgradeCost } from '../../src/core/game.js';
import { exportSave } from '../../src/core/save.js';

async function upload(page, state) {
  await page.locator('#import-save').setInputFiles({ name: 'visual.json', mimeType: 'application/json', buffer: Buffer.from(exportSave(state)) });
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
}
const color = (locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);

for (const viewport of [{ width: 1280, height: 720 }, { width: 1152, height: 648 }]) {
  test(`默认调度流程保留完整摇骰场景，动画结束后才可选择落点 ${viewport.width}x${viewport.height}`, async ({ page, context }, testInfo) => {
    await context.setOffline(true);
    await page.setViewportSize(viewport);
    await page.goto(pathToFileURL(resolve('dist/三国大富翁.html')).href);
    const initial = createGame({ seed: '三国-1' });
    const actor = currentPlayer(initial);
    const rolled = dispatch(initial, { type: 'ROLL', actorId: actor.id, revision: initial.revision }).state;
    await upload(page, initial);
    await page.getByRole('button', { name: '掷骰子', exact: true }).click();
    await expect(page.locator('.turn-dice')).toHaveClass(/rolling/);
    await expect(page.locator('.dice-backdrop')).toBeVisible();
    await expect(page.locator('.dice-routing')).toBeHidden();
    await expect(page.locator('.moving-piece')).toHaveCount(0);
    expect(await page.locator('.dice-stage').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(100);
    await page.screenshot({ path: testInfo.outputPath('restored-dice-animation.png') });
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await expect(page.locator('.turn-dice')).not.toHaveClass(/rolling/);
    await expect(page.locator('.dice-routing')).toBeHidden();
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await expect(page.locator('.turn-dice')).toHaveClass(/rolling/);
    await expect(page.locator('.dice-routing')).toBeVisible();
    await expect(page.locator('.turn-dice')).not.toHaveClass(/rolling/);
    await expect(page.locator('.dice-caption')).toHaveText(`本次掷出 ${rolled.dice} 点`);
    await expect(page.locator('.moving-piece')).toHaveCount(0);
    await page.getByRole('button', { name: '按原点数行军', exact: true }).click();
    await expect(page.locator('.moving-piece')).toBeVisible();
    await expect(page.locator('.turn-dice')).not.toHaveClass(/rolling/);
    await page.locator('#speed').selectOption('instant');
    await expect(page.locator(`[data-cell="${rolled.move.target}"] .token[data-player="${actor.id}"]`)).toBeVisible();
  });
}

test('六种骰点都停在上表面，结果面比侧面更清楚', async ({ page }) => {
  await page.goto('/');
  for (let value = 1; value <= 6; value++) {
    const state = createGame({ seed: '三国-1' });
    const actor = currentPlayer(state);
    state.phase = Phase.MOVING; state.dice = value; state.rollCount = 1;
    state.move = { from: actor.position, steps: value, target: (actor.position + value) % state.board.length, laps: 0 };
    await upload(page, state);
    await expect(page.locator('.moving-piece')).toBeVisible();
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    const faces = await page.locator('.dice-cube').evaluate((cube) => {
      const rotation = new DOMMatrix(getComputedStyle(cube).transform);
      return [...cube.children].map((face, index) => {
        const normal = new DOMPoint(0, 0, 1, 0)
          .matrixTransform(new DOMMatrix(getComputedStyle(face).transform)).matrixTransform(rotation);
        return { value: index + 1, y: normal.y, z: normal.z, pips: face.children.length };
      });
    });
    // The upward-facing result is tilted toward the viewer and has the largest projected area.
    expect(faces[value - 1].y).toBeLessThan(-0.5);
    expect(faces[value - 1].z).toBeGreaterThan(0.75);
    expect(faces.toSorted((a, b) => b.z - a.z)[0].value).toBe(value);
    expect(faces[value - 1].pips).toBe(value);
    await expect(page.locator('.dice-caption')).toHaveText(`本次掷出 ${value} 点`);
  }
});

test('Q版角色先摇骰再逐格跳跃，暂停和恢复保持落点正确', async ({ page, context }, testInfo) => {
  await context.setOffline(true);
  await page.goto(pathToFileURL(resolve('dist/三国大富翁.html')).href);
  const initial = createGame({ seed: '三国-1', config: { diceAdjustEnabled: false } });
  const actor = currentPlayer(initial);
  const moving = dispatch(initial, { type: 'ROLL', actorId: actor.id, revision: 0 }).state;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await upload(page, moving);
  await expect(page.locator('.turn-dice')).toHaveClass(/rolling/);
  await expect(page.locator('.moving-piece')).toHaveCount(0);
  await expect(page.locator('.moving-piece')).toBeVisible();
  await expect(page.locator('.turn-dice')).not.toHaveClass(/rolling/);
  await expect(page.locator('.turn-dice')).toHaveAttribute('aria-label', `骰点${moving.dice}`);
  await expect(page.locator('.moving-piece .token-art')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('character-hop.png') });
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.locator('.moving-piece')).toHaveCount(0);
  await expect(page.locator('.turn-dice')).not.toHaveClass(/rolling/);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.locator('#speed').selectOption('instant');
  await expect(page.getByRole('status')).not.toContainText('移动中');
  await expect(page.locator(`[data-cell="${moving.move.target}"] .token[data-player="${actor.id}"]`)).toBeVisible();
  await expect(page.locator('.moving-piece')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('ownership, facilities and tiers are visually distinct while secondary text stays folded', async ({ page, context }, testInfo) => {
  await context.setOffline(true);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(pathToFileURL(resolve('dist/三国大富翁.html')).href);
  const state = createGame({ seed: '三国-1' });
  for (const [faction, index, level] of [['wei', 1, 1], ['shu', 4, 2], ['wu', 24, 3]]) {
    const tile = state.board[index];
    let investment = landPrice(state, tile);
    for (let previous = 1; previous < level; previous++) investment += upgradeCost(state, { ...tile, level: previous });
    Object.assign(tile, { ownerId: state.players.find((p) => p.factionId === faction).id, level, investment });
  }
  await upload(page, state);
  const neutral = await color(page.locator('[data-cell="3"]'));
  const colors = new Set([neutral]);
  for (const index of [1, 4, 24]) {
    const tile = page.locator(`[data-cell="${index}"]`);
    colors.add(await color(tile));
    await expect(tile.locator('.ownership-flag')).toBeVisible();
    await expect(tile.locator('.level-badge')).toBeVisible();
  }
  expect(colors.size).toBe(4);
  for (const tile of await page.locator('.land.unowned').all()) expect(await color(tile)).toBe(neutral);
  expect(await color(page.locator('.special').first())).not.toBe(neutral);
  expect(await color(page.locator('.event').first())).not.toBe(neutral);
  await expect(page.locator('.log-history')).toHaveAttribute('open', '');
  await expect(page.locator('#tile-details')).not.toHaveAttribute('open');
  await page.locator('[data-cell="4"]').click();
  await expect(page.locator('#tile-details')).toHaveAttribute('open', '');
  await expect(page.locator('.history')).not.toHaveAttribute('open');
  await page.screenshot({ path: testInfo.outputPath('ownership.png'), fullPage: true });
});

test('buying and upgrading immediately update faction, building and cash feedback', async ({ page, context }) => {
  await context.setOffline(true);
  await page.goto(pathToFileURL(resolve('dist/三国大富翁.html')).href);
  const initial = createGame({ seed: '三国-1', config: { diceAdjustEnabled: false } });
  const actor = currentPlayer(initial);
  initial.phase = Phase.MOVING; initial.dice = 1; initial.rollCount = 1;
  initial.move = { from: 0, steps: 1, target: 1, laps: 0 };
  const landing = dispatch(initial, { type: 'FINISH_MOVE', actorId: actor.id, revision: 0 }).state;
  await upload(page, landing);
  const tile = page.locator('[data-cell="1"]');
  const before = await color(tile);
  await page.getByRole('button', { name: '确认购买', exact: true }).click();
  await expect(tile).toHaveClass(new RegExp(actor.factionId));
  await expect(tile.locator('.ownership-flag')).toBeVisible();
  expect(await color(tile)).not.toBe(before);
  await expect(page.locator('#feedback')).toContainText('−150 金');
  await expect(page.locator('#feedback')).toContainText(`${actor.name} 购买 ${landing.board[1].name}，花费 150 金`);
  const owned = structuredClone(initial);
  Object.assign(owned.board[1], { ownerId: actor.id, level: 1, investment: 150 });
  await upload(page, dispatch(owned, { type: 'FINISH_MOVE', actorId: actor.id, revision: 0 }).state);
  await page.getByRole('button', { name: '确认升级', exact: true }).click();
  await expect(tile.locator('.building-art')).toHaveClass(/level-2/);
  await expect(tile.locator('.level-badge')).toHaveText('Ⅱ');
  await expect(page.locator('#feedback')).toContainText('−90 金');
  await expect(page.locator('#feedback')).toContainText(`${actor.name} 升级 ${owned.board[1].name} 到 2 级，花费 90 金`);
});

test('action notifications explain cards and both sides of rent, and clear on import and expiry', async ({ page, context }) => {
  await context.setOffline(true);
  await page.goto(pathToFileURL(resolve('dist/三国大富翁.html')).href);
  const initial = createGame({ seed: '三国-1', config: { diceAdjustEnabled: false } });
  const actor = currentPlayer(initial);
  actor.cards = ['stride', 'fortune'];
  await upload(page, initial);
  await page.getByRole('button', { name: '使用 千里走单骑', exact: true }).click();
  await expect(page.locator('#feedback')).toContainText(`${actor.name} 使用 千里走单骑，本次行军额外 +2 格`);
  await expect(page.locator('#feedback .cash-change')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '使用 生财有道', exact: true })).toBeDisabled();
  await upload(page, initial);
  await page.getByRole('button', { name: '使用 生财有道', exact: true }).click();
  await expect(page.locator('#feedback .activity-toast')).toHaveCount(1);
  await expect(page.locator('#feedback')).toContainText('生财有道，获得 100 金');

  const renting = createGame({ seed: '三国-1' });
  const payer = currentPlayer(renting);
  const owner = renting.players.find((p) => p.id !== payer.id);
  payer.cards = ['rentShield'];
  Object.assign(renting.board[1], { ownerId: owner.id, level: 1, investment: 150 });
  renting.phase = Phase.MOVING; renting.dice = 1; renting.rollCount = 1;
  renting.move = { from: 0, steps: 1, target: 1, laps: 0 };
  const decision = dispatch(renting, { type: 'FINISH_MOVE', actorId: payer.id, revision: 0 }).state;
  await upload(page, decision);
  await expect(page.locator('#feedback .activity-toast')).toHaveCount(0);
  await page.getByRole('button', { name: '不使用，继续支付', exact: true }).click();
  await expect(page.locator('#feedback')).toContainText(`${payer.name} 向 ${owner.name} 支付 15 金（${renting.board[1].name} 过路费）`);
  await expect(page.locator('#feedback')).toContainText(`${payer.name} −15 金`);
  await expect(page.locator('#feedback')).toContainText(`${owner.name} +15 金`);

  await upload(page, decision);
  await page.clock.install();
  await page.getByRole('button', { name: '使用空城计，免除本次租金', exact: true }).click();
  await expect(page.locator('#feedback')).toContainText(`${payer.name} 使用空城计`);
  await expect(page.locator('#feedback')).toContainText(`15 金过路费（原应付给 ${owner.name}）`);
  await expect(page.locator('#feedback .cash-change')).toHaveCount(0);
  await page.clock.fastForward(6000);
  await expect(page.locator('#feedback .activity-toast')).toHaveCount(0);
});
