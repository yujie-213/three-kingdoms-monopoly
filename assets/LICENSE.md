# 原创素材说明

`portraits.svg`、`landmarks.svg`、`map-scene.svg`、`facilities.svg` 为本项目中绘制的原创矢量素材，未使用老游戏截图、第三方人物素材或在线字体。它们可随本项目复制、修改和分发；无需外部网络访问。设计灵感仅为三国人物公共题材与古风建筑。地图、九种建筑组合与七类设施可用 `node scripts/generate-map-art.js` 重新生成。

提示音由 Web Audio 本地合成，无外部录音或素材。系统字体由玩家操作系统提供，不随项目打包。

`tabletop-map-v1.png`、`tabletop-portraits-v1.png`、`tabletop-buildings-v1.png`、`tabletop-props-v1.png` 使用内置 imagegen 工具，依据用户确认的美术样稿生成。对应提示词与图集布局见 `docs/art/tabletop-assets-v1.md`。这些图片替换了当前界面的地图、人物、建筑、设施和锦囊视觉；旧矢量素材保留。生成图不是规则数据，人物名称、地点、费用和其他文字由应用实际状态渲染。所有运行素材内嵌至离线 HTML。

开发工具依赖各自许可，见 package-lock 对应包信息；它们不作为运行依赖进入最终 HTML。

v2 通过内置 ImageGen 生成独立的三主将半身肖像、全身棋子、九种建筑、三种锦囊、无骰子的木托盘背景以及“三国大富翁”标题。原始 PNG 与对应无损 WebP 保留；提示词见 `docs/art/tabletop-assets-v2.md`。WebP 仅为资源编码优化，脚本验证解码后的 RGBA 与原始 PNG 完全相同。骰子本体和动画仍由 CSS 与游戏状态绘制，托盘图不包含骰子或交互文字。参考图用于美术风格，不包含在运行包中。
