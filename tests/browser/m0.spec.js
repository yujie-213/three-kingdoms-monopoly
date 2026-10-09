import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { playToFinish } from './helpers.js';

async function verifyGame(page) {
  await expect(page.getByRole('heading', { name: '三国大富翁', exact: true })).toBeVisible();
  await expect(page.locator('.tile')).toHaveCount(40);
  await expect(page.locator('.token')).toHaveCount(3);
  await expect(page.getByRole('status')).toContainText('第 1 / 40 轮');
  await expect(page.locator('.board')).toHaveCSS('display', 'grid');
  await page.locator('#speed').selectOption('instant');
  await page.getByRole('button', { name: '掷骰子', exact: true }).click();
  await expect(page.locator('#log')).toContainText('掷出');
}

test('Vite development page starts and responds', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await verifyGame(page);
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  test(`offline file:// standalone HTML at ${viewport.width}x${viewport.height}`, async ({ page, context, browser }, testInfo) => {
    const requests = [];
    const errors = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await context.setOffline(true);
    const url = pathToFileURL(resolve('dist/三国大富翁.html')).href;
    await page.goto(url);
    await verifyGame(page);
    await expect(page.locator('.portrait').first()).toHaveCSS('background-image', /^url\("data:image\/(?:png|webp)/);
    await expect(page.locator('.building-art').first()).toHaveCSS('background-image', /^url\("data:image\/(?:png|webp)/);
    expect(await page.locator('.scene-art').evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.reload();
    await verifyGame(page);
    expect(errors).toEqual([]);
    expect(requests.filter((request) => request !== url && !request.startsWith('data:'))).toEqual([]);
    const buttonBox = await page.getByRole('button', { name: '新局设置', exact: true }).boundingBox();
    expect(buttonBox.x).toBeGreaterThanOrEqual(0);
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(viewport.height);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: testInfo.outputPath('offline.png'), fullPage: true });
    console.log(`Offline evidence: Edge ${browser.version()}; ${url}; requests=${JSON.stringify(requests)}; pageErrors=${errors.length}`);
  });
}

test('offline human + AI completes all 40 rounds, then starts a clean new game', async ({ page, context }, testInfo) => {
  test.setTimeout(180000);
  const requests = [];
  const errors = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await context.setOffline(true);
  const url = pathToFileURL(resolve('dist/三国大富翁.html')).href;
  await page.goto(url);
  await page.getByRole('button', { name: '新局设置', exact: true }).click();
  await page.locator('input[name="seed"]').fill('完整局');
  await page.getByRole('button', { name: '开始新局', exact: true }).click();
  await page.locator('#speed').selectOption('instant');
  await playToFinish(page);
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#result')).toContainText('40 个完整轮次结束');
  await expect(page.locator('#result tbody tr')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('completed-40-rounds.png'), fullPage: true });
  await page.locator('#speed').selectOption('normal');
  await page.getByRole('button', { name: '新局设置', exact: true }).click();
  await page.locator('select[name="factionId"]').selectOption('wu');
  await page.locator('select[name="humanId"]').selectOption('sun');
  await page.getByRole('button', { name: '开始新局', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.locator('#result')).toBeHidden();
  await expect(page.getByRole('status')).toContainText('第 1 / 40 轮');
  await expect(page.locator('#players')).toContainText('孙权（你）');
  await expect(page.locator('.player')).toContainText(['现金 1800', '现金 1800', '现金 1800']);
  expect(errors).toEqual([]);
  expect(requests.filter((request) => request !== url && !request.startsWith('data:'))).toEqual([]);
});
