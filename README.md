# 时停系列 · LiteLoaderQQNT-NoUpdate-reload

> 禁用 QQNT 更新：让 QQ 不再提示、不再下载、不再安装新版本。

适配 **QQ 9.9.35 / 9.9.36**，可用于 **MakeQQGreatAgain（MGQA）** 或 LiteLoaderQQNT。

上游项目：[xh321/LiteLoaderQQNT-Kill-Update](https://github.com/xh321/LiteLoaderQQNT-Kill-Update)（2023 年版，已不适配新版 QQ），本仓库是针对新版 QQNT 的重制版。

## 功能

| 层级 | 做了什么 |
| --- | --- |
| 主进程 · 配置推送 | 拦截 `onUnitedConfigUpdate` 推送，清掉其中的升级条目与 `qqUpdateSwitch` / `qqUpdateInstallSwitch` 开关 |
| 主进程 · 状态推送 | 命中升级标记的推送（`needUpdate` / `hasUpdaterInfo` / `silentUpdate` 等）改写成「无需更新」 |
| 主进程 · 网络 | 阻断热更新差分包下载（`qqpatch.gtimg.cn/hotUpdate*`），不碰 `dynamic_module` 等业务资源 |
| 渲染层 | 兜底关闭已经弹出的更新对话框（`update-dialog` / `force-update-dialog`） |
| 渲染层 · 入口 | 隐藏 QQ 主面板左下角「≡」菜单里的 **检查更新**（同时兼容 `检测更新` / `检查新版本` / `检查升级` 等措辞） |

## 安装

1. 下载本仓库（或 Release 包），确认目录里有 `manifest.json`；
2. 把整个目录放到插件目录下，目录名建议 `kill-update`；
3. 重启 QQ，或在 MGQA Ctrl 面板点「重载插件」。

用 MGQA 的话也可以直接在面板里用「安装新插件 / 安装文件夹」导入本目录或 zip。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `manifest.json` | 插件清单（LiteLoaderQQNT manifest_version 4） |
| `main.js` | 主进程：三层拦截的接线与打点 |
| `scrub.js` | 纯逻辑：更新字段识别与清洗（不依赖 electron，可单测） |
| `renderer.js` | 渲染层兜底：关闭更新弹窗 + 隐藏「≡」菜单里的「检查更新」入口 |
| `icon.png` | 图标 |

插件加载后可在 QQ 的日志里看到：

```
[Kill-Update] 已挂载 webContents 拦截
[Kill-Update] 已挂载请求过滤: ...
[Kill-Update] 拦截更新推送 channel=...
[Kill-Update] 已隐藏更新入口: A.q-context-menu-item q-context-menu-item--normal vue-component
```

## 常见问题

- **还弹更新提示？** 确认插件已启用（MGQA Ctrl 面板或 `config.json` 的 `enable_plugins`），并重启一次 QQ。
- **已经下载好的更新包？** 本插件只阻止「检查 + 下载 + 弹窗」，已经落到 `versions\` 下的增量包需要手动删掉对应版本目录，或让 QQ 走完一次再重启。
- **和手动改 QQ 文件冲突？** 增量更新要求基础文件是原始的；如果你还改过 `package.json` 等文件，建议先临时停用插件让 QQ 完成一次更新，再启用。

## 许可

MIT，见 `LICENSE`。原始版权归 XiaoHe321（2023）；本重制版由 Simon404Error 适配新版 QQNT。
