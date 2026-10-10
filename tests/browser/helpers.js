export async function playToFinish(page, maximum = 1500) {
  for (let steps = 0; steps < maximum; steps++) {
    await page.waitForFunction(() => !document.querySelector('#result').hidden || document.querySelector('#actions button:not(:disabled)'));
    if (await page.locator('#result').isVisible()) {
      const observe = page.locator('#result').getByRole('button', { name: '继续观战', exact: true });
      if (await observe.count()) { await observe.click(); continue; }
      return;
    }
    const action = page.locator('#actions');
    const button = (name) => action.getByRole('button', { name, exact: true });
    if (await button('使用 生财有道').count() && await button('使用 生财有道').isEnabled()) await button('使用 生财有道').click();
    else if (await button('使用 千里走单骑').count() && await button('使用 千里走单骑').isEnabled()) await button('使用 千里走单骑').click();
    else if (await button('掷骰子').count()) await button('掷骰子').click();
    else if (await button('按原点数行军').count()) await button('按原点数行军').click();
    else if (await button('额外掷骰子').count()) await button('额外掷骰子').click();
    else if (await button('结束回合').count()) await button('结束回合').click();
    else if (await button('放弃').count()) {
      const costs = action.locator('.decision-costs dd');
      const cost = Number.parseInt(await costs.nth(0).innerText(), 10);
      const cash = Number.parseInt(await costs.nth(1).innerText(), 10);
      if (cash - cost >= 200) await action.getByRole('button', { name: /确认购买|确认升级/ }).click();
      else await button('放弃').click();
    } else if (await button('使用空城计，免除本次租金').count()) {
      const match = (await action.innerText()).match(/支付 (\d+) 金过路费。当前现金 (\d+)/);
      await button(Number(match[1]) >= 60 || Number(match[2]) < Number(match[1]) ? '使用空城计，免除本次租金' : '不使用，继续支付').click();
    } else if (await button('放弃新锦囊').count()) {
      await button('放弃新锦囊').click();
    } else if (await button('确认出售').count()) await button('确认出售').click();
    else if (await button('资产不足，确认破产').count()) await button('资产不足，确认破产').click();
    else await action.getByRole('button', { name: /^出售 / }).first().click();
  }
  throw new Error('UI action limit reached');
}
