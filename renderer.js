"use strict";
/*
 * 时停系列 / kill-update - 渲染层兜底
 * 主进程已经拦掉了更新配置与更新推送，这里只负责：
 *   1. 关掉已经弹出来的更新对话框（含新版 update-dialog / force-update-dialog）
 *   2. 把「立即更新 / 马上升级 / 重启更新」这类按钮所在的弹窗关掉
 */

(function () {
    if (typeof document === "undefined") return;
    if (window.__mqgaKillUpdateRenderer) return;
    window.__mqgaKillUpdateRenderer = true;

    var BUTTON_TEXT = /立即更新|马上更新|立即升级|马上升级|立即重启|重启更新|升级到|版本更新/;
    var killed = 0;

    function closeDialog(dialog, why) {
        try {
            var closeIcon = dialog.querySelector(".q-dialog-header i, .q-dialog-header .q-icon, .q-dialog-header button");
            if (closeIcon && typeof closeIcon.click === "function") {
                closeIcon.click();
            }
            if (document.body && dialog.parentNode) {
                dialog.parentNode.removeChild(dialog);
            }
            killed++;
            if (killed <= 20) console.log("[Kill-Update] 已关闭更新弹窗 (" + why + ")");
        } catch (e) {
            console.log("[Kill-Update] 关闭弹窗失败", e);
        }
    }

    function scan() {
        try {
            var dialogs = document.querySelectorAll(
                ".update-dialog, .force-update-dialog, [class*='update-dialog'], .q-dialog[data-type='update']"
            );
            for (var i = 0; i < dialogs.length; i++) closeDialog(dialogs[i], "class");

            var all = document.querySelectorAll(".q-dialog, .q-dialog-main");
            for (var j = 0; j < all.length; j++) {
                var dialog = all[j];
                var buttons = dialog.querySelectorAll("button, .q-button");
                for (var k = 0; k < buttons.length; k++) {
                    var text = (buttons[k].textContent || "").trim();
                    if (BUTTON_TEXT.test(text)) { closeDialog(dialog, "button:" + text); break; }
                }
            }
        } catch (e) { /* 忽略 */ }
    }

    scan();
    var timer = setInterval(scan, 800);
    // 半分钟后还没弹过窗，降频到 5s，别一直空转
    setTimeout(function () {
        clearInterval(timer);
        timer = setInterval(scan, 5000);
    }, 30000);

    try {
        if (document.body) {
            new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
        }
    } catch (e) { /* 忽略 */ }

    console.log("[Kill-Update] 渲染层兜底已启动");
})();
