"use strict";
/*
 * kill-update 的纯逻辑部分（不依赖 electron，方便单测）
 * 由 main.js require；测试脚本见 MakeQQGreatAgain\bin\test-kill-update.js
 */

const UPDATE_KEYS = new Set([
    "releaseversion", "lowestversion", "jumpurl", "fullupdateurl", "patchupdateurl",
    "updateurl", "updateurl64", "downloadurl", "patchurl", "newversion", "targetversion",
    "fullupdate", "patchupdate", "updatepackname", "updatepacksize", "updatepackmd5",
]);

function isUpdateKey(key) {
    const k = String(key).toLowerCase();
    if (UPDATE_KEYS.has(k)) return true;
    if (k.startsWith("qqupdate")) return true;   // qqUpdateSwitch / qqUpdateInstallSwitch
    if (k === "needupdate" || k === "hasupdaterinfo") return true;
    return false;
}

function isUpdateEntry(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const keys = Object.keys(value).map((k) => k.toLowerCase());
    const has = (k) => keys.includes(k);
    if (has("releaseversion") && (has("jumpurl") || has("lowestversion") || has("fullupdateurl") || has("patchupdateurl") || has("updateurl"))) return true;
    if (has("releaseversion") && (has("needupdate") || has("hasupdaterinfo"))) return true;
    if (has("fullupdateurl") || has("patchupdateurl") || has("updatepackmd5")) return true;
    return false;
}

function scrubValue(value, depth, log) {
    if (depth > 12 || value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) {
        const kept = [];
        for (let i = 0; i < value.length; i++) {
            const item = value[i];
            if (isUpdateEntry(item)) {
                if (log) log("丢弃更新配置条目 #" + i + " " + JSON.stringify(item).slice(0, 200));
                continue;
            }
            kept.push(scrubValue(item, depth + 1, log));
        }
        return kept;
    }
    const out = {};
    let dropped = 0;
    for (const key of Object.keys(value)) {
        if (isUpdateKey(key)) { dropped++; continue; }
        const child = value[key];
        if (typeof child === "string" && child.length > 2 && (child[0] === "{" || child[0] === "[")) {
            out[key] = scrubJsonString(child, depth + 1, log);
            continue;
        }
        out[key] = scrubValue(child, depth + 1, log);
    }
    if (dropped && log) log("丢弃更新字段 x" + dropped);
    return out;
}

function scrubJsonString(text, depth, log) {
    if (depth > 12) return text;
    if (text.indexOf("releaseVersion") === -1 &&
        text.indexOf("qqUpdate") === -1 &&
        text.indexOf("jumpUrl") === -1 &&
        text.indexOf("fullUpdateUrl") === -1) return text;
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return text; }
    const scrubbed = JSON.stringify(scrubValue(parsed, depth + 1, log));
    if (scrubbed === text) return text;
    if (log) log("united config 已清洗: " + text.length + " -> " + scrubbed.length + " 字节");
    return scrubbed;
}

function scrubArgs(args, log) {
    let touched = false;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (typeof arg === "string") {
            const next = scrubJsonString(arg, 0, log);
            if (next !== arg) { args[i] = next; touched = true; }
            continue;
        }
        if (arg && typeof arg === "object") {
            args[i] = scrubValue(arg, 0, log);
            touched = true;
        }
    }
    return touched;
}

/*
 * 只有当推送里真的出现「升级专用标记」时才动手，避免误伤普通业务推送
 * （QQ 的推送对象里 needUpdate / dialogVisible 之类的通用字段不算标记）。
 */
function hasUpdateMarker(node, depth) {
    if (!node || typeof node !== "object" || depth > 10) return false;
    if (Array.isArray(node)) {
        for (const item of node) if (hasUpdateMarker(item, depth + 1)) return true;
        return false;
    }
    const keys = Object.keys(node).map((k) => k.toLowerCase());
    const has = (k) => keys.includes(k);
    if (has("hasupdaterinfo")) return true;
    if (has("releaseversion") && (has("jumpurl") || has("lowestversion") || has("fullupdateurl") ||
        has("patchupdateurl") || has("updateurl") || has("needupdate") || has("silentupdate") ||
        has("issilentupgradetask"))) return true;
    for (const key of Object.keys(node)) {
        if (node[key] && typeof node[key] === "object" && hasUpdateMarker(node[key], depth + 1)) return true;
    }
    return false;
}

function fixUpdateFlags(node, depth) {
    if (!node || typeof node !== "object" || depth > 10) return false;
    if (Array.isArray(node)) {
        let hit = false;
        for (const item of node) hit = fixUpdateFlags(item, depth + 1) || hit;
        return hit;
    }
    let hit = false;
    for (const key of Object.keys(node)) {
        const value = node[key];
        const k = key.toLowerCase();
        if (value && typeof value === "object") {
            hit = fixUpdateFlags(value, depth + 1) || hit;
            continue;
        }
        // 注意: 不带 dialogVisible —— 那是通用字段，改了会伤到别的弹窗
        if (k === "needupdate" || k === "hasupdaterinfo" || k === "autoupdate" ||
            k === "silentupdate" || k === "issilentupdate" || k === "issilentupgradetask" ||
            k === "forceupdate") {
            if (value === true) { node[key] = false; hit = true; }
            continue;
        }
        if (k === "releaseversion" || k === "newversion" || k === "targetversion" ||
            k === "jumpurl" || k === "fullupdateurl" || k === "patchupdateurl") {
            if (typeof value === "string" && value !== "") { node[key] = ""; hit = true; }
            continue;
        }
    }
    return hit;
}

// 只拦 QQNT 热更新通道，不碰 dynamic_module 等业务资源
const BLOCK_RE = /qqpatch\.gtimg\.cn\/hotUpdate|\/hotUpdate_new|hotUpdate\/[^/]*\.(patch|zip|7z)|\/patch\/.*(fruitade|diff)/i;

module.exports = { isUpdateKey, isUpdateEntry, hasUpdateMarker, scrubValue, scrubJsonString, scrubArgs, fixUpdateFlags, BLOCK_RE, UPDATE_KEYS };
