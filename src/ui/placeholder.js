export function mountPlaceholder(root) {
  root.innerHTML = `
    <article class="panel">
      <p class="eyebrow">工程验证 · M0</p>
      <h1>三国大富翁</h1>
      <p class="intro">从一份可离线打开的 HTML，开始我们的三国之旅。</p>
      <div class="placeholder" aria-label="游戏地图占位区域">
        <span>地图与棋子将在 M1 加入</span>
      </div>
      <p>当前版本只验证工程与发布链路，尚未实现游戏规则。</p>
      <button type="button" id="verify-runtime">验证脚本运行</button>
      <p id="runtime-status" role="status" aria-live="polite">页面脚本已启动</p>
      <small>无需在线字体、图片或 API。正式游戏功能将在后续阶段逐步加入。</small>
    </article>`;

  root.querySelector('#verify-runtime').addEventListener('click', () => {
    root.querySelector('#runtime-status').textContent = '验证成功：按钮响应正常';
  });
}
