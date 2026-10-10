import { test, expect } from '@playwright/test';
import { mkdtemp, copyFile, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { playToFinish } from './helpers.js';

test('recipient can open only the copied HTML offline, finish a game and restore a save', async ({ page, context, browser }, testInfo) => {
  test.setTimeout(180000);
  // No source files or asset folders accompany the recipient's copy.
  const folder = await mkdtemp(join(tmpdir(), 'three-kingdoms-recipient-'));
  const name = '三国大富翁 分享体验.html';
  await copyFile(resolve('dist/三国大富翁.html'), join(folder, name));
  expect(await readdir(folder)).toEqual([name]);
  const url = pathToFileURL(join(folder, name)).href;
  const requests = [], errors = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  await context.setOffline(true);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(url);
  await expect(page.getByRole('heading', { name: '三国大富翁', exact: true })).toBeVisible();
  await expect(page.locator('.tile')).toHaveCount(40);
  for (const selector of ['.portrait', '.token-art', '.building-art', '.facility-art', '.dice-backdrop']) {
    expect(await page.locator(selector).first().evaluate(async (element) => {
      const picture = new Image();
      picture.src = getComputedStyle(element).backgroundImage.slice(5, -2);
      await picture.decode();
      return picture.naturalWidth > 0;
    })).toBe(true);
  }
  for (const img of await page.locator('img').all()) {
    expect(await img.evaluate(async (element) => { await element.decode(); return element.naturalWidth > 0; })).toBe(true);
  }
  await page.screenshot({ path: testInfo.outputPath('recipient-offline.png') });
  await page.getByRole('button', { name: '新局设置', exact: true }).click();
  await page.locator('select[name="mode"]').selectOption('rounds');
  await page.getByText('高级设置', { exact: true }).click();
  await page.locator('input[name="seed"]').fill('完整局');
  await page.getByRole('button', { name: '开始新局', exact: true }).click();
  await page.locator('#speed').selectOption('instant');
  await playToFinish(page);
  await expect(page.locator('#result')).toContainText('40 个完整轮次结束');
  await page.getByRole('button', { name: '查看终局棋盘', exact: true }).click();
  const pendingDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出存档', exact: true }).click();
  const save = await readFile(await (await pendingDownload).path());
  await page.reload();
  await expect(page.locator('#result')).toContainText('40 个完整轮次结束');
  await page.getByRole('button', { name: '查看终局棋盘', exact: true }).click();
  await page.locator('#import-save').setInputFiles({ name: '试玩存档.json', mimeType: 'application/json', buffer: save });
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.locator('#result')).toContainText('40 个完整轮次结束');
  await page.getByRole('button', { name: '查看终局棋盘', exact: true }).click();
  const restoredDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出存档', exact: true }).click();
  const restored = await readFile(await (await restoredDownload).path(), 'utf8');
  expect(JSON.parse(restored).state).toEqual(JSON.parse(save.toString()).state);
  expect(errors).toEqual([]);
  expect(requests.filter((request) => request !== url && !request.startsWith('data:'))).toEqual([]);
  console.log(`Recipient verification: ${testInfo.project.name} ${browser.version()}, one HTML in isolated folder, offline 40 rounds + save restore, no external requests or page errors.`);
});
