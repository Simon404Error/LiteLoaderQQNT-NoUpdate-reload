"use strict";
/*
 * 时停系列 / kill-update —— 禁用QQNT更新
 * 适配 QQ 9.9.35 / 9.9.36 + MakeQQGreatAgain
 *
 * 上游: https://github.com/xh321/LiteLoaderQQNT-Kill-Update (2023, 只认旧版数据结构)
 * 本适配版针对 2025+ 的 QQNT 做了三层拦截（纯逻辑在 ./scrub.js，可单测）:
 *
 *   1) 主进程 united config 拦截
 *      上游只处理 `args.find(arg => arg.cmdName.indexOf("onUnitedConfigUpdate") != -1)`
 *      且只认 payload.configData.content 是「数组」的情况。
 *      新版 QQ 分多组推送 (UnitedConfigNodeStore / UnitedConfigStore /
 *      registerUnitedConfigUpdateListener)，content 可能是数组也可能是对象，
 *      还多了 qqUpdateSwitch / qqUpdateInstallSwitch 开关字段。
 *      这里改成结构无关的深度清洗。
 *
 *   2) 主进程更新状态推送拦截
 *      新版更新弹窗由 push 的对象驱动 (needUpdate / hasUpdaterInfo / autoUpdate /
 *      silentUpdate)，命中即改写成「不需要更新」。
 *
 *   3) 更新包下载阻断
 *      热更新差分包走 https://qqpatch.gtimg.cn/hotUpdate_new ，在 webRequest 层 cancel。
 *
 * 渲染层 renderer.js 兜底：关掉已经弹出来的更新对话框。
 */

const electron = require("electron");
const { app, ipcMain } = electron;
const scrub = require("./scrub.js");

const CFG = {
    killUnitedConfig: true,
    killUpdatePush: true,
    blockUpdateUrls: true,
    log: true,
};

let counter = 0;
function log(...args) {
    if (!CFG.log) return;
    try {
        if (++counter > 200) return;   // united config 推送很频繁，限流
        console.log("[Kill-Update]", ...args);
    } catch (e) { /* 忽略 */ }
}

/* --------------------------- webContents 打点 --------------------------- */

function patchWebContents(wc) {
    if (!wc || wc.__mqgaKillUpdatePatched) return;
    try {
        wc.__mqgaKillUpdatePatched = true;
        const originalSend = wc.send.bind(wc);
        wc.send = function (channel, ...args) {
            try {
                const ch = String(channel || "");
                if (/unitedconfig/i.test(ch)) {
                    if (CFG.killUnitedConfig && scrub.scrubArgs(args, log)) log("拦截 united config channel=" + ch);
                }
                if (CFG.killUpdatePush) {
                    for (const arg of args) {
                        if (!arg || typeof arg !== "object") continue;
                        if (!scrub.hasUpdateMarker(arg, 0)) continue;   // 只动真的升级推送
                        const preview = (() => { try { return JSON.stringify(arg).slice(0, 300); } catch (e) { return ""; } })();
                        if (scrub.fixUpdateFlags(arg, 0)) log("拦截更新推送 channel=" + ch + " " + preview);
                    }
                }
                if (CFG.killUnitedConfig && !/unitedconfig/i.test(ch)) {
                    // 有的版本把 united config 塞在别的 channel 里，按内容特征兜一层
                    for (const arg of args) {
                        if (!arg || typeof arg !== "object") continue;
                        const json = (() => { try { return JSON.stringify(arg); } catch (e) { return ""; } })();
                        if (json.indexOf("onUnitedConfigUpdate") !== -1) {
                            if (scrub.scrubArgs(args, log)) log("拦截 united config (channel=" + ch + ")");
                            break;
                        }
                    }
                }
            } catch (e) { log("send 拦截异常: " + (e && e.message)); }
            return originalSend(channel, ...args);
        };
        if (typeof wc.postMessage === "function") {
            const originalPost = wc.postMessage.bind(wc);
            wc.postMessage = function (channel, message, ...rest) {
                try {
                    if (message && typeof message === "object") {
                        if (CFG.killUnitedConfig) scrub.scrubValue(message, 0, log);
                        if (CFG.killUpdatePush && scrub.hasUpdateMarker(message, 0) && scrub.fixUpdateFlags(message, 0)) {
                            log("拦截 postMessage 更新推送");
                        }
                    }
                } catch (e) { /* 忽略 */ }
                return originalPost(channel, message, ...rest);
            };
        }
        log("已挂载 webContents 拦截");
    } catch (e) {
        log("挂载 webContents 失败: " + (e && e.message));
    }
}

/* ------------------------------ 下载阻断 ------------------------------ */

function hookSession(ses) {
    if (!ses || ses.__mqgaKillUpdateHooked) return;
    try {
        ses.__mqgaKillUpdateHooked = true;
        ses.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
            try {
                if (CFG.blockUpdateUrls && details && scrub.BLOCK_RE.test(String(details.url || ""))) {
                    log("阻断更新包请求: " + details.url);
                    callback({ cancel: true });
                    return;
                }
            } catch (e) { /* 忽略 */ }
            callback({});
        });
        log("已挂载请求过滤: " + (ses.storagePath || "default session"));
    } catch (e) {
        log("挂载请求过滤失败: " + (e && e.message));
    }
}

/* ------------------------------- 生命周期 ------------------------------- */

function allWebContents() {
    try { return electron.webContents ? electron.webContents.getAllWebContents() : []; } catch (e) { return []; }
}

function install() {
    try {
        if (app.isReady()) {
            for (const wc of allWebContents()) patchWebContents(wc);
            hookSession(electron.session.defaultSession);
            for (const wc of allWebContents()) {
                try { if (wc.session) hookSession(wc.session); } catch (e) { /* 忽略 */ }
            }
        } else {
            app.once("ready", install);
        }
    } catch (e) {
        log("install 异常: " + (e && e.message));
    }
    try {
        app.on("web-contents-created", (event, wc) => {
            patchWebContents(wc);
            try { if (wc.session) hookSession(wc.session); } catch (e) { /* 忽略 */ }
        });
        app.on("session-created", (ses) => hookSession(ses));
    } catch (e) {
        log("注册 app 事件失败: " + (e && e.message));
    }
    // 少量更新状态走 ipcMain.handle
    try {
        const originalHandle = ipcMain.handle.bind(ipcMain);
        ipcMain.handle = function (channel, listener) {
            if (/unitedconfig/i.test(String(channel))) {
                return originalHandle(channel, async (...a) => {
                    const result = await listener(...a);
                    try { return scrub.scrubValue(result, 0, log); } catch (e) { return result; }
                });
            }
            return originalHandle(channel, listener);
        };
    } catch (e) { /* 忽略 */ }
}

function onLoad(plugin) {
    log("插件已加载 (时停系列 0.3.0 / MGQA)");
}

function onReady() {
    install();
}

// MGQA 主进程钩子：每个窗口创建时补一次（有些窗口早于 app ready）
function onBrowserWindowCreated(window) {
    try {
        install();
        patchWebContents(window.webContents);
        try { if (window.webContents && window.webContents.session) hookSession(window.webContents.session); } catch (e) { /* 忽略 */ }
    } catch (e) {
        log("onBrowserWindowCreated 异常: " + (e && e.message));
    }
}

install();

module.exports = { onLoad, onBrowserWindowCreated, onReady, install };
