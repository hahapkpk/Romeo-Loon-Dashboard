# Romeo · Loon 模块雷达

一个无需后端的 Loon 模块搜索页：按软件名称汇总 Romeo 仓库内的 `.lpx`／`.plugin`，显示 Romeo 文件的最近提交日期，复制可直接导入 Loon 的 Raw URL。

## 立即使用

保持 `index.html`、`styles.css`、`app.js`、`data.js` 在同一目录，双击 `index.html` 即可查看已生成的索引。支持软件／作者搜索、最近更新排序、关注软件（保存在当前浏览器的 localStorage）、查看不同作者和 Beta／Official 版本、复制模块 URL。联网字体不可用时自动使用本地字体；索引本身可离线浏览，但打开源码和导入链接需要网络。

- “最近提交”指 Romeo **镜像仓库**中该文件最后一次提交，不代表原作者实际更新时间；部分文件由镜像同步时会同时更新。
- 模块中的 `#!date` 如果存在，在展开项显示为“模块标注”，不作为排序依据。
- “复制链接”优先选择非 Beta 的 `.lpx`（有多个作者时选该类别最近一次提交）；想选择特定作者请展开列表。
- 本工具不判断模块的安全性或实际可用性；导入前请检查对应源码及作者说明。
- 英文转中文使用 `build_index.py` 中的 `ALIASES` 映射，已是中文的 `#!name` 保留原样；未确认中文名的不自动臆译。

## 部署成会自动更新的网页

1. 把整个项目上传到**你自己的 GitHub 仓库**，默认分支命名为 `main`。
2. 在该仓库 Settings → Pages → Build and deployment → Source 中选择 **GitHub Actions**。
3. 在 Actions 中手动运行 `Refresh Loon directory and deploy`，成功后从 Pages 设置查看网站地址。之后 workflow 每 3 小时（UTC 00:17、03:17 等）尝试刷新一次，也可以随时从 Actions 手动运行。GitHub 的 scheduled workflows 可能延迟或被平台暂停，可手动触发。

上传项目并不修改 ifflagged/Romeo 仓库；自动部署需要你自己的 GitHub 仓库。离线双击打开的是生成时的快照，不会自行更新。网站在线时会随着自己的 Actions 成功部署更新，不是每次打开网页实时抓取。

## 本地刷新索引

需要 Git 和 Python 3.10+，联网执行：

```bash
git clone --filter=blob:none --no-checkout https://github.com/ifflagged/Romeo.git romeo-history
python build_index.py --repo romeo-history --out .
```

之后若重新刷新，先在 `romeo-history` 目录执行 `git fetch origin main`、`git reset --hard origin/main`，再运行上述 Python 命令。生成器以同一 commit SHA 下载源码归档、解析模块头部，同时遍历本地 Git history 获得每个文件的最近提交日期；不依赖 GitHub API 的逐文件请求。首次生成会下载完整源码归档，文件较大。

## 文件结构

- `index.html` / `styles.css` / `app.js`：静态页面
- `data.js`：已生成的索引，双击打开页面也能正常加载
- `build_index.py`：从 Romeo 生成索引
- `.github/workflows/site.yml`：自动刷新和 GitHub Pages 部署
