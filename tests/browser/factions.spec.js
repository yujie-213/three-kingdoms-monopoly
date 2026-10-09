import { test, expect } from '@playwright/test';

test('chooses a faction and its general, and shows historical administration for each region', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新局设置', exact: true }).click();
  await page.locator('[name="factionId"]').selectOption('wei');
  await expect(page.locator('[name="humanId"] option')).toHaveText(['曹操']);
  await page.getByRole('button', { name: '开始新局', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.locator('#players')).toContainText('魏 · 曹操（你）');
  await expect(page.locator('.player')).toHaveCount(3);
  for (const [index, hierarchy] of [[4, '豫州 · 颍川郡 · 许县'], [17, '荆州 · 长沙郡 · 临湘县'], [24, '扬州 · 丹阳郡 · 建业县'], [34, '益州 · 蜀郡 · 成都县']]) {
    await page.locator(`[data-cell="${index}"]`).click();
    await expect(page.locator('#tile-info')).toContainText(hierarchy);
  }
  await expect(page.locator('[aria-label="曹操Q版肖像"]')).toBeVisible();
  await expect(page.locator('[aria-label="孙权Q版肖像"]')).toBeVisible();
});
