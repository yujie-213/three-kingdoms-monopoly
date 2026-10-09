# 分发与可选静态托管

## 离线分发（首版主要方式）

`npm run release` 顺序运行测试、单文件构建、浏览器验收，再生成 `releases/三国大富翁-v1.0.0.html` 和同名 `.sha256`。只发送HTML即可；同学无需服务器、Node或网络。

版本发布不会覆盖同版本不同内容：改动后提升 package.json 和 package-lock 版本。`dist/三国大富翁.html` 是可再生成工作产物，不作为不可变版本记录。依赖/产物/缓存/私人存档忽略提交。

验收记录见 VALIDATION。反馈按 FEEDBACK 模板填写；推荐附JSON存档和种子，先去除无关个人信息。

## GitHub Pages（可选，尚未上线）

本仓库无remote和提交，也没有配置GitHub账号；没有上传、发布或创建远程仓库。已准备：

- `npm run prepare:pages`：构建并复制单HTML为 `pages-artifact/index.html`，仅本地准备。
- `.github/workflows/pages.yml`：手动 `workflow_dispatch`，build完成后才deploy；不会在每次push时自动发布。
- `.github/workflows/ci.yml`：以后推送代码可自动验证规则与离线浏览器流程；本次尚未实际运行GitHub CI。

以后使用：先选择自己的GitHub仓库、检查源码和密钥忽略规则后提交推送；在仓库 Settings → Pages 选择 GitHub Actions；从 Actions 手动运行“Publish game to GitHub Pages”。完成后以工作流给出的真实URL为准，本文件不虚构地址。

Pages产物不要求CDN或后端，部署后仍可下载同一HTML离线运行。配置与权限参考 [GitHub Pages官方工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)，Node版本设置参考 [setup-node](https://github.com/actions/setup-node)。外部Actions工作流已准备，但没有远程执行验证。
