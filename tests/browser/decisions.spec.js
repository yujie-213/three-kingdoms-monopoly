import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGame, currentPlayer, dispatch, Phase, landPrice, upgradeCost } from '../../src/core/game.js';
import { exportSave } from '../../src/core/save.js';

function landing({ upgrade = false, debt = false } = {}) {
  const state = createGame(), actor = currentPlayer(state);
  const index = debt ? 1 : 4;
  if (debt) {
    actor.cash = 5;
    for (const tile of state.board.filter((item) => item.type === 'land')) {
      Object.assign(tile, { ownerId: tile.index === 1 ? state.order[1] : actor.id, level: 1, investment: landPrice(state, tile) });
    }
  } else if (upgrade) {
    const tile = state.board[index];
    Object.assign(tile, { ownerId: actor.id, level: 2, investment: landPrice(state, tile) + upgradeCost(state, { ...tile, level: 1 }) });
  }
  actor.position = debt ? 0 : 2;
  state.phase = Phase.MOVING; state.dice = debt ? 1 : 2; state.rollCount = 1;
  state.move = { from: actor.position, steps: state.dice, target: index, laps: 0 };
  return dispatch(state, { type: 'FINISH_MOVE', actorId: actor.id, revision: 0 }).state;
}
async function upload(page, state) {
  await page.locator('#import-save').setInputFiles({ name: 'decision.json', mimeType: 'application/json', buffer: Buffer.from(exportSave(state)) });
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
}
async function assertFits(page, viewport) {
  expect(await page.locator('#actions').evaluate((panel) => panel.scrollHeight <= panel.clientHeight && panel.scrollWidth <= panel.clientWidth)).toBe(true);
  const panel = await page.locator('#actions').boundingBox();
  for (const button of await page.locator('#actions button').all()) {
    const box = await button.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(panel.y + panel.height);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height);
}

for (const viewport of [{ width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1152, height: 648 }]) {
  test(`decision information and all buttons fit without scrolling at ${viewport.width}x${viewport.height}`, async ({ page, context }, testInfo) => {
    await context.setOffline(true);
    await page.setViewportSize(viewport);
    await page.goto(pathToFileURL(resolve('dist/三国大富翁.html')).href);
    for (const upgrade of [false, true]) {
      const state = landing({ upgrade });
      await upload(page, state);
      await page.locator('[data-cell="4"]').click();
      await expect(page.locator('.dice-caption')).toHaveText('本次掷出 2 点');
      await expect(page.locator('.action-heading .dice-caption')).toBeVisible();
      await expect(page.getByRole('button', { name: upgrade ? '确认升级' : '确认购买', exact: true })).toBeVisible();
      const caption = await page.locator('.dice-caption').boundingBox();
      const summary = await page.locator('.decision-summary').boundingBox();
      expect(caption.y + caption.height).toBeLessThan(summary.y);
      if (await page.locator('.dice-plinth').isVisible()) {
        const tray = await page.locator('.dice-plinth').boundingBox();
        expect(caption.y + caption.height).toBeLessThan(tray.y);
      }
      await assertFits(page, viewport);
      if (!upgrade) await page.screenshot({ path: testInfo.outputPath('purchase-no-scroll.png'), fullPage: true });
    }
    const state = landing({ debt: true });
    await upload(page, state);
    await expect(page.locator('#actions')).toHaveAttribute('data-phase', 'DEBT_RESOLUTION');
    const last = state.board.filter((tile) => tile.ownerId === currentPlayer(state).id).at(-1);
    await page.locator('#sale-land').selectOption(last.id);
    await assertFits(page, viewport);
    await page.getByRole('button', { name: new RegExp(`^出售 ${last.name}`) }).click();
    await assertFits(page, viewport);
    await page.getByRole('button', { name: '确认出售', exact: true }).click();
    await expect(page.locator('#actions')).toHaveAttribute('data-phase', 'TURN_END');
    await expect(page.locator('#log')).toContainText(`出售 ${last.name}`);
  });
}
