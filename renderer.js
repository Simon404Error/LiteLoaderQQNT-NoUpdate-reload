"use strict";
/*
 * 时停系列 / kill-update — 渲染层兜底（v0.4.0）
 *
 *   1. 关掉已经弹出来的更新对话框（update-dialog / force-update-dialog，
 *      以及任何带「立即更新 / 马上升级 / 重启更新」的弹窗）
 *   2. 删掉 QQ 主面板左下角「≡」菜单里的「检查更新」入口
 *      （实测 QQ 9.9.35-52892 的 DOM：.q-context-menu.q-context-menu__mixed-type.more-menu
 *         > a.q-context-menu-item[role=menuitem]
 *           > span.q-context-menu-item__text
 *             > span.q-badge.q-badge__red.setting-item-update
 *               > span.menu-item-label  ← 文本「检查更新」
 *       这里不写死结构：按「文字 = 检查更新」往上找到那一行再隐藏，结构变了也照样生效）
 *
 * 只做隐藏不删节点：菜单是 Vue 每次打开重建的，删节点容易和 vdom 打架，
 * display:none 既能去掉那一行也不留空位。
 */

(function () {
    if (typeof document === "undefined") return;
    if (window.__mqgaKillUpdateRenderer) return;
    window.__mqgaKillUpdateRenderer = true;

    /* ------------------------- 1) 更新弹窗 ------------------------- */
    var BUTTON_TEXT = /立即更新|马上更新|立即升级|马上升级|立即重启|重启更新|升级到|版本更新/;
    var killed = 0;

    function closeDialog(dialog, why) {
        try {
            var closeIcon = dialog.querySelector(".q-dialog-header i, .q-dialog-header .q-icon, .q-dialog-header button");
            if (closeIcon && typeof closeIcon.click === "function") closeIcon.click();
            if (document.body && dialog.parentNode) dialog.parentNode.removeChild(dialog);
            killed++;
            if (killed <= 20) console.log("[Kill-Update] 已关闭更新弹窗 (" + why + ")");
        } catch (e) {
            console.log("[Kill-Update] 关闭弹窗失败", e);
        }
    }

    function killDialogs() {
        var dialogs = document.querySelectorAll(
            ".update-dialog, .force-update-dialog, [class*='update-dialog'], .q-dialog[data-type='update']"
        );
        var i, j, k;
        for (i = 0; i < dialogs.length; i++) closeDialog(dialogs[i], "class");

        var all = document.querySelectorAll(".q-dialog, .q-dialog-main");
        for (j = 0; j < all.length; j++) {
            var dialog = all[j];
            var buttons = dialog.querySelectorAll("button, .q-button");
            for (k = 0; k < buttons.length; k++) {
                var text = (buttons[k].textContent || "").trim();
                if (BUTTON_TEXT.test(text)) { closeDialog(dialog, "button:" + text); break; }
            }
        }
    }

    /* ---------------------- 2) 「检查更新」入口 ---------------------- */
    // 精确文字（去掉所有空白后比较），避免误伤「设置」这类正常项
    var MENU_TEXTS = { "检查更新": 1, "检查新版本": 1, "检测更新": 1, "检查升级": 1, "检测新版本": 1 };
    var hidden = 0;
    var reported = false;

    function norm(el) { return (el.textContent || "").replace(/\s+/g, "").trim(); }

    function hideRow(el) {
        // 一路往上走：只要父节点的文字仍然只有「检查更新」，就说明这行还没被包完
        var key = norm(el);
        var row = el;
        for (var i = 0; i < 8; i++) {
            var p = row.parentElement;
            if (!p || norm(p) !== key) break;
            row = p;
        }
        // 认得出就是这一行；菜单行、设置行都适用
        if (row.getAttribute("data-mqga-hidden") === "1") return false;
        row.setAttribute("data-mqga-hidden", "1");
        row.style.display = "none";
        hidden++;
        if (!reported) {
            reported = true;
            try {
                console.log("[Kill-Update] 已隐藏更新入口: " + row.tagName + "." + String(row.className || "").slice(0, 80));
                console.log("[Kill-Update] 被隐藏节点: " + String(row.outerHTML || "").replace(/\s+/g, " ").slice(0, 400));
                if (window.MQGA && window.MQGA.writeText && window.MQGA.paths && window.MQGA.paths.root) {
                    window.MQGA.writeText(window.MQGA.paths.root + "\\logs\\kill-update-hidden.html",
                        "<!-- " + new Date().toISOString() + " url=" + location.href + " -->\n" + String(row.outerHTML || ""));
                }
            } catch (e) { }
        }
        return true;
    }

    var lastBroad = 0;

    function killUpdateEntries() {
        var i, hitNow = 0;
        // 快路径：QQ 自带的 update 徽标 class + 菜单项/图标按钮
        var quick = document.querySelectorAll(".setting-item-update, .menu-item-label, [role='menuitem']");
        for (i = 0; i < quick.length; i++) {
            if (MENU_TEXTS[norm(quick[i])] && hideRow(quick[i])) hitNow++;
        }
        if (hitNow > 0) return;                      // 本轮已经命中，不必再扫全文档

        // 慢路径（兜底）：结构改名/换措辞时靠文字找，最多每 5s 跑一次
        var now = Date.now();
        if (now - lastBroad < 5000) return;
        lastBroad = now;
        var all = document.querySelectorAll("span, div, a, li, button");
        for (i = 0; i < all.length; i++) {
            var el = all[i];
            if (el.childElementCount > 2) continue;
            if (!el.firstChild) continue;
            var raw = el.textContent || "";
            if (raw.length > 12) continue;           // 先按长度挡掉绝大多数元素
            var t = raw.replace(/\s+/g, "").trim();
            if (!MENU_TEXTS[t]) continue;
            hideRow(el);
        }
    }

    /* --------------------------- 调度 --------------------------- */
    var last = 0;
    function scan() {
        var now = Date.now();
        if (now - last < 300) return;      // 菜单/聊天窗口 DOM 变动很频繁，限流
        last = now;
        try { killDialogs(); } catch (e) { }
        try { killUpdateEntries(); } catch (e) { }
    }

    scan();
    var timer = setInterval(scan, 800);
    setTimeout(function () {
        clearInterval(timer);
        timer = setInterval(scan, 2000);
    }, 30000);

    try {
        if (document.body) {
            new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
        }
    } catch (e) { }

    console.log("[Kill-Update] 渲染层兜底已启动（含「检查更新」入口隐藏）");
})();
