import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createGame } from '../../src/core/game.js';
import { exportSave } from '../../src/core/save.js';

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  test(`game desktop fits one screen at ${viewport.width}x${viewport.height}`, async ({ page, context }, testInfo) => {
    await page.setViewportSize(viewport);
    await context.setOffline(true);
    await page.goto(pathToFileURL(resolve('dist/三国大富翁.html')).href);
    const state = createGame({ seed: '三国-1' });
    state.players.find((player) => player.human).cards = ['rentShield', 'stride', 'fortune'];
    // Use the real save flow so a full inventory also exercises the action panel.
    await page.locator('#import-save').setInputFiles({ name: 'layout.json', mimeType: 'application/json', buffer: Buffer.from(exportSave(state)) });
    await page.getByRole('button', { name: '确认导入', exact: true }).click();
    await expect(page.locator('#actions')).toContainText('我的锦囊 3 / 3');
    await expect(page.getByRole('status')).toContainText('（玩家）');
    await expect(page.getByRole('status')).not.toContainText('真人');
    for (const selector of ['.portrait', '.token-art', '.building-art', '.facility-art', '.card-art', '.dice-backdrop']) {
      const loaded = await page.locator(selector).first().evaluate(async (element) => {
        const url = getComputedStyle(element).backgroundImage;
        if (!/^url\("data:image\/(?:png|webp)/.test(url)) return false;
        const picture = new Image();
        picture.src = url.slice(5, -2);
        await picture.decode();
        return picture.naturalWidth > 0;
      });
      expect(loaded).toBe(true);
    }
    for (const [card, effect] of [['rentShield', '免除本次敌地过路费'], ['stride', '额外 +2 格'], ['fortune', '立即获得 100 金']]) {
      await page.locator(`.card-hand [data-card-info="${card}"]`).hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await expect(page.getByRole('tooltip')).toContainText(effect);
      const hint = await page.getByRole('tooltip').boundingBox();
      expect(hint.x + hint.width).toBeLessThanOrEqual(viewport.width);
      expect(hint.y + hint.height).toBeLessThanOrEqual(viewport.height);
    }
    await page.mouse.move(0, 0);
    await expect(page.getByRole('tooltip')).not.toBeVisible();
    await page.locator('.card-token').focus();
    await expect(page.getByRole('tooltip')).toContainText('免除本次敌地过路费');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).not.toBeVisible();
    await page.locator('.player.shu .player-details summary').click();
    await page.locator('.player.shu .mini-card').first().hover();
    await expect(page.getByRole('tooltip')).toContainText('免除本次敌地过路费');
    await page.mouse.move(0, 0);
    await page.locator('.player.shu .player-details summary').click();
    const forces = await page.locator('.players-panel').boundingBox();
    const history = await page.locator('.log-panel').boundingBox();
    expect(history.height).toBeGreaterThan(forces.height);
    expect(await page.locator('.players-panel').evaluate((panel) => panel.scrollHeight <= panel.clientHeight)).toBe(true);
    for (const player of await page.locator('.player').all()) {
      const overview = await player.boundingBox();
      expect(overview.y + overview.height).toBeLessThanOrEqual(forces.y + forces.height);
    }
    const dice = await page.locator('.turn-dice').boundingBox();
    const stage = await page.locator('.dice-stage').boundingBox();
    const roll = await page.getByRole('button', { name: '掷骰子', exact: true }).boundingBox();
    const inventory = await page.locator('.inventory').boundingBox();
    expect(dice.width).toBeGreaterThanOrEqual(72);
    expect(dice.y + dice.height).toBeLessThan(roll.y);
    expect(stage.height).toBeGreaterThan(inventory.height * 2);
    expect(inventory.height).toBeLessThan(110);
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(viewport.width);
    expect(dimensions.height).toBeLessThanOrEqual(viewport.height);
    for (const selector of ['.topbar', '#board', '#players', '#actions', '#tile-info', '#actions button']) {
      for (const element of await page.locator(selector).all()) {
        const box = await element.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      }
    }
    const players = await page.locator('#players').boundingBox();
    const board = await page.locator('#board').boundingBox();
    const actions = await page.locator('#actions').boundingBox();
    for (const button of await page.locator('#actions button').all()) {
      const box = await button.boundingBox();
      expect(box.y + box.height).toBeLessThanOrEqual(actions.y + actions.height);
    }
    expect(players.x + players.width).toBeLessThan(board.x);
    expect(board.x + board.width).toBeLessThan(actions.x);
    expect(await page.locator('.tile').evaluateAll((tiles) => tiles.every((tile) => tile.scrollHeight <= tile.clientHeight && tile.scrollWidth <= tile.clientWidth))).toBe(true);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: testInfo.outputPath('game-desktop.png'), fullPage: true });
    await page.getByRole('button', { name: '新局设置', exact: true }).click();
    await expect(page.locator('#setup-dialog')).toBeVisible();
    await page.getByRole('button', { name: '返回对局', exact: true }).click();
    await expect(page.locator('#setup-dialog')).not.toBeVisible();
    await expect(page.locator('#actions')).toContainText('我的锦囊 3 / 3');
  });
}
