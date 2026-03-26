/**
 * Web Element Picker - 元素选择器
 * 注入到任意 Web 页面中，提供元素选取功能
 * 支持：悬停高亮、点击选中、Shift+Click 上移父元素、ESC 退出
 */
(function () {
    'use strict';

    if (window.__webPickerLoaded) return;
    window.__webPickerLoaded = true;

    let isPickerActive = false;
    let hoveredElement = null;
    let overlayBox = null;
    let currentDepthElement = null; // 用于 Shift+Click 父级上移

    // ========== 批量修改队列 ==========
    const batchQueue = [];

    window.__webPickerBatch = {
        add: function(item) {
            batchQueue.push(item);
            updateBatchPanel();
        },
        getQueue: function() { return batchQueue; },
        clear: function() { batchQueue.length = 0; updateBatchPanel(); }
    };

    // ========== 创建浮动按钮 ==========
    const fab = document.createElement('div');
    fab.id = '__picker-fab';
    fab.innerHTML = '🎯';
    fab.title = '切换元素选择模式 (也可按 Alt+P)';
    fab.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;
        font-size: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2147483640;
        box-shadow: 0 4px 20px rgba(99,102,241,0.4);
        transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        user-select: none;
        border: none;
    `;
    fab.addEventListener('mouseenter', () => {
        fab.style.transform = 'scale(1.1)';
        fab.style.boxShadow = '0 6px 28px rgba(99,102,241,0.6)';
    });
    fab.addEventListener('mouseleave', () => {
        fab.style.transform = 'scale(1)';
        fab.style.boxShadow = '0 4px 20px rgba(99,102,241,0.4)';
    });
    fab.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePicker();
    });
    document.body.appendChild(fab);

    // ========== 创建撤销按钮 ==========
    const undoBtn = document.createElement('div');
    undoBtn.id = '__picker-undo';
    undoBtn.innerHTML = '↩';
    undoBtn.title = '撤销上一次修改';
    undoBtn.style.cssText = `
        position: fixed;
        bottom: 90px;
        right: 24px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: linear-gradient(135deg, #f59e0b, #ef4444);
        color: white;
        font-size: 22px;
        display: none;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 2147483640;
        box-shadow: 0 4px 16px rgba(245,158,11,0.4);
        transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        user-select: none;
        border: none;
    `;
    undoBtn.addEventListener('mouseenter', () => {
        undoBtn.style.transform = 'scale(1.1)';
    });
    undoBtn.addEventListener('mouseleave', () => {
        undoBtn.style.transform = 'scale(1)';
    });
    undoBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        undoBtn.innerHTML = '⏳';
        try {
            const resp = await fetch('/api/undo', { method: 'POST' });
            const result = await resp.json();
            if (result.success) {
                undoBtn.innerHTML = '✓';
                // 撤销成功后隐藏按钮并清除持久化标记
                setTimeout(() => {
                    undoBtn.style.display = 'none';
                    try { sessionStorage.removeItem('__picker_show_undo'); } catch(e) {}
                }, 1500);
            }
        } catch (err) {
            undoBtn.innerHTML = '✕';
            setTimeout(() => {
                undoBtn.innerHTML = '↩';
            }, 2000);
        }
    });
    document.body.appendChild(undoBtn);

    // 页面加载时检查是否需要显示撤销按钮（跨刷新持久化）
    try {
        if (sessionStorage.getItem('__picker_show_undo') === 'true') {
            undoBtn.style.display = 'flex';
        }
    } catch(e) {}

    // 暴露显示撤销按钮的方法
    window.__webPickerShowUndo = function() {
        undoBtn.style.display = 'flex';
        try { sessionStorage.setItem('__picker_show_undo', 'true'); } catch(e) {}
    };

    // ========== 批量队列浮动面板 ==========
    const batchPanel = document.createElement('div');
    batchPanel.id = '__picker-batch-panel';
    batchPanel.style.cssText = `
        position: fixed; bottom: 24px; left: 24px;
        width: 320px; max-height: 400px;
        background: rgba(30,30,46,0.95); backdrop-filter: blur(12px);
        border-radius: 12px; overflow: hidden;
        box-shadow: 0 8px 40px rgba(0,0,0,0.4);
        color: #cdd6f4; font-family: 'Segoe UI', system-ui, sans-serif;
        z-index: 2147483640; border: 1px solid rgba(99,102,241,0.3);
        display: none; flex-direction: column;
    `;
    batchPanel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(49,50,68,0.8);border-bottom:1px solid #45475a;">
            <span style="font-size:13px;font-weight:600;color:#cba6f7;">📋 修改队列 <span id="__batch-count" style="color:#6c7086;font-weight:400;">(0)</span></span>
            <div style="display:flex;gap:4px;">
                <button id="__batch-clear" style="padding:3px 8px;border:1px solid #45475a;background:transparent;color:#6c7086;border-radius:4px;cursor:pointer;font-size:10px;">清空</button>
                <button id="__batch-send" style="padding:3px 10px;border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border-radius:4px;cursor:pointer;font-size:10px;font-weight:600;">一起发送 →</button>
            </div>
        </div>
        <div id="__batch-list" style="overflow-y:auto;max-height:300px;padding:8px;"></div>
    `;
    document.body.appendChild(batchPanel);

    document.getElementById('__batch-clear').addEventListener('click', () => {
        batchQueue.length = 0;
        updateBatchPanel();
    });
    document.getElementById('__batch-send').addEventListener('click', async () => {
        if (batchQueue.length === 0) return;
        // 合并所有队列项为一个 payload
        const merged = {
            selector: batchQueue.map(q => q.selector).join(', '),
            outerHTML: batchQueue.map(q => q.outerHTML).join('\n---\n'),
            computedStyles: '',
            description: batchQueue.map((q, i) => `### 修改 ${i + 1}\n**元素**: \`${q.classNames || q.selector}\`\n${q.description}`).join('\n\n'),
            directText: '',
            childSummary: '',
            classNames: batchQueue.map(q => q.classNames).filter(Boolean).join(' | '),
            ancestorChain: batchQueue[0].ancestorChain || '',
            frameworkInfo: batchQueue[0].frameworkInfo || null,
            identifiers: null,
            referenceImage: null,
            elementScreenshot: null,
            pageUrl: batchQueue[0].pageUrl || window.location.href,
            visualChanges: null,
            batchMode: true,
            batchCount: batchQueue.length
        };
        try {
            const resp = await fetch('/api/modify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(merged)
            });
            const result = await resp.json();
            if (result.success) {
                batchQueue.length = 0;
                updateBatchPanel();
                if (window.__webPickerShowUndo) window.__webPickerShowUndo();
                // 显示等待提示
                const toast = document.createElement('div');
                toast.id = '__picker-waiting-toast';
                toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;padding:14px 28px;border-radius:12px;font-size:14px;z-index:2147483647;box-shadow:0 4px 24px rgba(99,102,241,0.4);display:flex;align-items:center;gap:10px;font-family:system-ui,sans-serif;';
                toast.innerHTML = '<span style="display:inline-block;animation:__pickerSpin 1s linear infinite;">⏳</span> 已发送 ' + merged.batchCount + ' 个修改到 AI Chat...';
                document.body.appendChild(toast);
            }
        } catch (err) {
            alert('发送失败: ' + err.message);
        }
    });

    function updateBatchPanel() {
        const count = batchQueue.length;
        const countEl = document.getElementById('__batch-count');
        if (countEl) countEl.textContent = `(${count})`;
        batchPanel.style.display = count > 0 ? 'flex' : 'none';
        const list = document.getElementById('__batch-list');
        if (!list) return;
        list.innerHTML = '';
        batchQueue.forEach((item, i) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;margin-bottom:4px;background:#181825;border-radius:6px;font-size:11px;';
            const desc = (item.description || '').substring(0, 40);
            const selector = (item.classNames || item.selector || '').substring(0, 30);
            row.innerHTML = `
                <span style="color:#6c7086;min-width:16px;">${i + 1}</span>
                <div style="flex:1;overflow:hidden;">
                    <div style="color:#89b4fa;font-family:monospace;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${selector}</div>
                    <div style="color:#a6adc8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${desc}</div>
                </div>
                <button data-idx="${i}" class="__batch-remove" style="background:none;border:none;color:#f38ba8;cursor:pointer;font-size:14px;padding:0 4px;">✕</button>
            `;
            list.appendChild(row);
        });
        list.querySelectorAll('.__batch-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                batchQueue.splice(idx, 1);
                updateBatchPanel();
            });
        });
    }

    // ========== 创建高亮覆盖层 ==========
    overlayBox = document.createElement('div');
    overlayBox.id = '__picker-overlay';
    overlayBox.style.cssText = `
        position: fixed;
        pointer-events: none;
        border: 2px dashed #6366f1;
        background: rgba(99, 102, 241, 0.08);
        z-index: 2147483638;
        display: none;
        transition: all 0.15s ease;
        border-radius: 3px;
    `;
    document.body.appendChild(overlayBox);

    // ========== 创建标签提示 ==========
    const labelBox = document.createElement('div');
    labelBox.id = '__picker-label';
    labelBox.style.cssText = `
        position: fixed;
        pointer-events: none;
        background: #6366f1;
        color: white;
        font-size: 11px;
        font-family: 'Segoe UI', monospace;
        padding: 2px 8px;
        border-radius: 3px;
        z-index: 2147483639;
        display: none;
        white-space: nowrap;
    `;
    document.body.appendChild(labelBox);

    // ========== 状态提示条 ==========
    const statusBar = document.createElement('div');
    statusBar.id = '__picker-status';
    statusBar.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 36px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;
        font-size: 13px;
        font-family: 'Segoe UI', sans-serif;
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 2147483641;
        letter-spacing: 0.5px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    `;
    statusBar.textContent = '🎯 选择模式 — 点击选元素 | Shift+点击 选父元素 | ESC 退出';
    document.body.appendChild(statusBar);

    // ========== 切换选择器 ==========
    function togglePicker() {
        isPickerActive = !isPickerActive;
        currentDepthElement = null;

        if (isPickerActive) {
            fab.innerHTML = '✕';
            fab.style.background = 'linear-gradient(135deg, #ef4444, #f97316)';
            fab.style.boxShadow = '0 4px 20px rgba(239,68,68,0.4)';
            statusBar.style.display = 'flex';
            document.body.style.cursor = 'crosshair';
        } else {
            fab.innerHTML = '🎯';
            fab.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
            fab.style.boxShadow = '0 4px 20px rgba(99,102,241,0.4)';
            statusBar.style.display = 'none';
            overlayBox.style.display = 'none';
            labelBox.style.display = 'none';
            document.body.style.cursor = '';
            hoveredElement = null;
        }
    }

    // ========== 鼠标悬停高亮 ==========
    document.addEventListener('mouseover', (e) => {
        if (!isPickerActive) return;
        const target = e.target;
        if (isPickerElement(target)) return;

        hoveredElement = target;
        currentDepthElement = target;
        highlightElement(target);
    }, true);

    document.addEventListener('mouseout', (e) => {
        if (!isPickerActive) return;
        if (isPickerElement(e.target)) return;

        overlayBox.style.display = 'none';
        labelBox.style.display = 'none';
    }, true);

    // ========== 点击选中 ==========
    document.addEventListener('click', (e) => {
        if (!isPickerActive) return;
        if (isPickerElement(e.target)) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        let target = e.target;

        // Shift+Click: 在当前高亮元素的基础上向父级上移
        if (e.shiftKey && currentDepthElement) {
            const parent = currentDepthElement.parentElement;
            if (parent && parent !== document.documentElement && parent !== document.body) {
                currentDepthElement = parent;
                target = parent;
                highlightElement(target);
                return; // 不退出选择模式，继续让用户调整
            }
        }

        // 如果点击的元素有子元素，弹出子元素选择面板
        if (target.children.length > 0) {
            togglePicker();
            showSubElementPanel(target);
            return;
        }

        // 叶子元素：直接选中并打开对话框
        selectAndOpenDialog(target);
    }, true);

    // ========== 选中元素并打开对话框（支持多选）==========
    function selectAndOpenDialog(elOrEls, visualChanges) {
        const elements = Array.isArray(elOrEls) ? elOrEls : [elOrEls];
        if (elements.length === 1) {
            const info = getElementInfo(elements[0]);
            if (visualChanges) { info.visualChanges = visualChanges; }
            captureElementScreenshot(elements[0]).then((screenshot) => {
                info.elementScreenshot = screenshot;
                if (window.__webPickerDialog) {
                    window.__webPickerDialog.open(info);
                }
            });
        } else {
            // 多选：合并信息
            const infos = elements.map(el => getElementInfo(el));
            const merged = {
                selector: infos.map(i => i.selector).join(', '),
                outerHTML: infos.map(i => i.outerHTML).join('\n\n'),
                computedStyles: infos[0].computedStyles,
                tagName: infos.map(i => i.tagName).join(', '),
                textContent: infos.map(i => i.textContent).join(' | '),
                directText: infos.map(i => i.directText).filter(Boolean).join(' | '),
                childSummary: '',
                classNames: [...new Set(infos.map(i => i.classNames).filter(Boolean))].join(' | '),
                ancestorChain: infos[0].ancestorChain,
                frameworkInfo: infos[0].frameworkInfo,
                identifiers: infos[0].identifiers,
                rect: infos[0].rect,
                pageUrl: infos[0].pageUrl,
                elementScreenshot: null,
                multiSelect: true,
                selectedCount: elements.length,
                visualChanges: visualChanges || null
            };
            if (window.__webPickerDialog) {
                window.__webPickerDialog.open(merged);
            }
        }
    }

    // ========== 递归复制子元素样式 ==========
    function copyChildStyles(origEl, cloneEl) {
        const origChildren = origEl.children;
        const cloneChildren = cloneEl.children;
        for (let i = 0; i < origChildren.length && i < cloneChildren.length; i++) {
            const oc = origChildren[i];
            const cc = cloneChildren[i];
            if (isPickerElement(oc)) continue;
            const cs = window.getComputedStyle(oc);
            const props = [
                'color','background','background-color','background-image',
                'font-family','font-size','font-weight','font-style','line-height',
                'text-align','text-decoration','text-transform',
                'padding','margin','border','border-radius','box-shadow',
                'display','flex-direction','flex-wrap','justify-content','align-items','gap',
                'width','height','max-width','max-height','min-width','min-height',
                'overflow','opacity','white-space','word-break','box-sizing','vertical-align',
                'position','top','left','right','bottom','transform'
            ];
            cc.style.cssText = props.map(p => `${p}:${cs.getPropertyValue(p)}`).join(';');
            if (oc.children.length > 0) {
                copyChildStyles(oc, cc);
            }
        }
    }

    // ========== Figma 风格可视化编辑器 ==========
    function showVisualEditor(containerEl, selectedElements) {
        const old = document.getElementById('__picker-visual-editor');
        if (old) old.remove();

        const containerRect = containerEl.getBoundingClientRect();
        const containerStyles = window.getComputedStyle(containerEl);

        // 记录每个子元素的原始状态（包括样式属性）
        const elements = selectedElements || Array.from(containerEl.children).filter(c => !isPickerElement(c));
        const originalStates = elements.map(el => {
            const r = el.getBoundingClientRect();
            const cs = window.getComputedStyle(el);
            return {
                el,
                left: r.left - containerRect.left,
                top: r.top - containerRect.top,
                width: r.width,
                height: r.height,
                selector: getCSSSelector(el),
                classNames: el.className && typeof el.className === 'string' ? el.className.trim() : '',
                text: (el.textContent || '').substring(0, 40).trim(),
                // 原始样式属性
                backgroundColor: cs.backgroundColor,
                color: cs.color,
                fontSize: parseInt(cs.fontSize) || 14,
                borderRadius: parseInt(cs.borderRadius) || 0,
                opacity: parseFloat(cs.opacity) || 1
            };
        });

        let selectedIdx = -1; // 当前选中的元素索引
        let editingTextIdx = -1; // 正在编辑文字的元素索引

        // 全屏编辑器背景
        const editor = document.createElement('div');
        editor.id = '__picker-visual-editor';
        editor.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 15, 25, 0.88); backdrop-filter: blur(8px);
            z-index: 2147483645; display: flex; flex-direction: column;
            font-family: 'Segoe UI', system-ui, sans-serif;
        `;

        // 顶部工具栏
        const toolbar = document.createElement('div');
        toolbar.style.cssText = `
            display: flex; justify-content: space-between; align-items: center;
            padding: 10px 20px; background: rgba(30,30,46,0.98);
            border-bottom: 1px solid #45475a; flex-shrink: 0;
        `;
        toolbar.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:14px;font-weight:600;color:#cba6f7;">🎨 可视化编辑</span>
                <span style="font-size:11px;color:#6c7086;">点击选中 · 拖拽移动 · 8向缩放 · 双击改文字 · 右侧面板改颜色/字号/圆角/透明度</span>
            </div>
            <div style="display:flex;gap:6px;">
                <button id="__ve-delete" style="padding:5px 10px;border:1px solid #f38ba8;background:transparent;color:#f38ba8;border-radius:6px;cursor:pointer;font-size:11px;opacity:0.4;pointer-events:none;" title="删除选中元素">🗑️</button>
                <button id="__ve-reset" style="padding:5px 10px;border:1px solid #45475a;background:transparent;color:#cdd6f4;border-radius:6px;cursor:pointer;font-size:11px;">重置</button>
                <button id="__ve-cancel" style="padding:5px 10px;border:1px solid #45475a;background:transparent;color:#cdd6f4;border-radius:6px;cursor:pointer;font-size:11px;">取消</button>
                <button id="__ve-confirm" style="padding:5px 10px;border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;">确认修改 →</button>
            </div>
        `;
        editor.appendChild(toolbar);

        // 主体：画布 + 属性面板
        const body = document.createElement('div');
        body.style.cssText = 'flex:1;display:flex;overflow:hidden;';

        // 画布区域
        const canvas = document.createElement('div');
        canvas.style.cssText = `
            flex: 1; display: flex; align-items: center; justify-content: center;
            overflow: auto; padding: 40px;
        `;

        // 克隆容器
        const stage = document.createElement('div');
        stage.id = '__ve-stage';
        stage.style.cssText = `
            position: relative;
            width: ${containerRect.width}px;
            height: ${containerRect.height}px;
            background: ${containerStyles.background};
            background-color: ${containerStyles.backgroundColor};
            border-radius: ${containerStyles.borderRadius};
            border: 2px dashed rgba(99,102,241,0.3);
            overflow: visible;
            flex-shrink: 0;
        `;

        // 右侧属性面板
        const propsPanel = document.createElement('div');
        propsPanel.id = '__ve-props-panel';
        propsPanel.style.cssText = `
            width: 240px; flex-shrink: 0;
            background: rgba(30,30,46,0.98); border-left: 1px solid #45475a;
            overflow-y: auto; padding: 0;
            display: flex; flex-direction: column;
        `;
        propsPanel.innerHTML = `
            <div style="padding:16px 16px 12px;border-bottom:1px solid #313244;">
                <div style="font-size:12px;font-weight:600;color:#a6adc8;">属性</div>
            </div>
            <div id="__ve-props-content" style="padding:12px 16px;flex:1;">
                <div style="color:#6c7086;font-size:12px;text-align:center;padding:40px 0;">
                    点击选中一个元素<br>查看和编辑属性
                </div>
            </div>
        `;

        // 辅助函数：RGB/RGBA 转 HEX
        function rgbToHex(rgbStr) {
            if (!rgbStr || rgbStr === 'transparent') return '#000000';
            const match = rgbStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (!match) return '#000000';
            const r = parseInt(match[1]), g = parseInt(match[2]), b = parseInt(match[3]);
            return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        }

        // 辅助函数：更新属性面板内容
        function updatePropsPanel(idx) {
            const content = document.getElementById('__ve-props-content');
            if (!content || idx < 0 || idx >= editableItems.length) {
                if (content) content.innerHTML = `<div style="color:#6c7086;font-size:12px;text-align:center;padding:40px 0;">点击选中一个元素<br>查看和编辑属性</div>`;
                return;
            }
            const item = editableItems[idx];
            const w = item.wrapper;
            const clone = w.querySelector('div, span, p, h1, h2, h3, a, button, img, section, article, header, footer, nav, main, aside, li, ul, ol, table') || w.children[0];

            const curX = Math.round(parseFloat(w.style.left));
            const curY = Math.round(parseFloat(w.style.top));
            const curW = Math.round(parseFloat(w.style.width));
            const curH = Math.round(parseFloat(w.style.height));
            const curBg = rgbToHex(item.currentBg || item.original.backgroundColor);
            const curColor = rgbToHex(item.currentColor || item.original.color);
            const curFontSize = item.currentFontSize || item.original.fontSize;
            const curRadius = item.currentBorderRadius !== undefined ? item.currentBorderRadius : item.original.borderRadius;
            const curOpacity = item.currentOpacity !== undefined ? item.currentOpacity : item.original.opacity;

            const inputStyle = `width:100%;padding:4px 6px;background:#181825;border:1px solid #45475a;border-radius:4px;color:#cdd6f4;font-size:12px;font-family:monospace;outline:none;box-sizing:border-box;`;
            const labelStyle = `font-size:10px;color:#6c7086;margin-bottom:2px;display:block;`;
            const rowStyle = `margin-bottom:10px;`;
            const halfRowStyle = `display:inline-block;width:48%;vertical-align:top;`;

            content.innerHTML = `
                <div style="font-size:11px;color:#89b4fa;margin-bottom:12px;font-family:monospace;word-break:break-all;">${item.original.classNames || item.original.selector}</div>

                <div style="display:flex;gap:6px;${rowStyle}">
                    <div style="flex:1;">
                        <label style="${labelStyle}">X</label>
                        <input type="number" id="__ve-prop-x" value="${curX}" style="${inputStyle}">
                    </div>
                    <div style="flex:1;">
                        <label style="${labelStyle}">Y</label>
                        <input type="number" id="__ve-prop-y" value="${curY}" style="${inputStyle}">
                    </div>
                </div>
                <div style="display:flex;gap:6px;${rowStyle}">
                    <div style="flex:1;">
                        <label style="${labelStyle}">W</label>
                        <input type="number" id="__ve-prop-w" value="${curW}" style="${inputStyle}">
                    </div>
                    <div style="flex:1;">
                        <label style="${labelStyle}">H</label>
                        <input type="number" id="__ve-prop-h" value="${curH}" style="${inputStyle}">
                    </div>
                </div>

                <div style="border-top:1px solid #313244;margin:8px 0;"></div>

                <div style="${rowStyle}">
                    <label style="${labelStyle}">背景色</label>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <input type="color" id="__ve-prop-bg" value="${curBg}" style="width:28px;height:28px;border:1px solid #45475a;border-radius:4px;cursor:pointer;padding:0;background:none;">
                        <input type="text" id="__ve-prop-bg-text" value="${curBg}" style="${inputStyle}flex:1;">
                    </div>
                </div>
                <div style="${rowStyle}">
                    <label style="${labelStyle}">文字色</label>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <input type="color" id="__ve-prop-color" value="${curColor}" style="width:28px;height:28px;border:1px solid #45475a;border-radius:4px;cursor:pointer;padding:0;background:none;">
                        <input type="text" id="__ve-prop-color-text" value="${curColor}" style="${inputStyle}flex:1;">
                    </div>
                </div>

                <div style="border-top:1px solid #313244;margin:8px 0;"></div>

                <div style="${rowStyle}">
                    <label style="${labelStyle}">字号 <span id="__ve-prop-fs-val">${curFontSize}</span>px</label>
                    <input type="range" id="__ve-prop-fs" min="8" max="72" value="${curFontSize}" style="width:100%;accent-color:#6366f1;cursor:pointer;">
                </div>
                <div style="${rowStyle}">
                    <label style="${labelStyle}">圆角 <span id="__ve-prop-br-val">${curRadius}</span>px</label>
                    <input type="range" id="__ve-prop-br" min="0" max="50" value="${curRadius}" style="width:100%;accent-color:#6366f1;cursor:pointer;">
                </div>
                <div style="${rowStyle}">
                    <label style="${labelStyle}">透明度 <span id="__ve-prop-op-val">${Math.round(curOpacity * 100)}</span>%</label>
                    <input type="range" id="__ve-prop-op" min="0" max="100" value="${Math.round(curOpacity * 100)}" style="width:100%;accent-color:#6366f1;cursor:pointer;">
                </div>
            `;

            // 绑定属性面板事件
            const bindInput = (id, callback) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', callback);
            };

            // 位置/尺寸
            bindInput('__ve-prop-x', (e) => { w.style.left = e.target.value + 'px'; });
            bindInput('__ve-prop-y', (e) => { w.style.top = e.target.value + 'px'; });
            bindInput('__ve-prop-w', (e) => {
                w.style.width = e.target.value + 'px';
                updateSizeLabel(idx);
            });
            bindInput('__ve-prop-h', (e) => {
                w.style.height = e.target.value + 'px';
                updateSizeLabel(idx);
            });

            // 背景色
            bindInput('__ve-prop-bg', (e) => {
                const cloneEl = w.children[0];
                if (cloneEl) cloneEl.style.backgroundColor = e.target.value;
                item.currentBg = e.target.value;
                const textEl = document.getElementById('__ve-prop-bg-text');
                if (textEl) textEl.value = e.target.value;
            });
            bindInput('__ve-prop-bg-text', (e) => {
                const val = e.target.value;
                if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                    const cloneEl = w.children[0];
                    if (cloneEl) cloneEl.style.backgroundColor = val;
                    item.currentBg = val;
                    const colorEl = document.getElementById('__ve-prop-bg');
                    if (colorEl) colorEl.value = val;
                }
            });

            // 文字色
            bindInput('__ve-prop-color', (e) => {
                const cloneEl = w.children[0];
                if (cloneEl) cloneEl.style.color = e.target.value;
                item.currentColor = e.target.value;
                const textEl = document.getElementById('__ve-prop-color-text');
                if (textEl) textEl.value = e.target.value;
            });
            bindInput('__ve-prop-color-text', (e) => {
                const val = e.target.value;
                if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                    const cloneEl = w.children[0];
                    if (cloneEl) cloneEl.style.color = val;
                    item.currentColor = val;
                    const colorEl = document.getElementById('__ve-prop-color');
                    if (colorEl) colorEl.value = val;
                }
            });

            // 字号
            bindInput('__ve-prop-fs', (e) => {
                const val = parseInt(e.target.value);
                const cloneEl = w.children[0];
                if (cloneEl) cloneEl.style.fontSize = val + 'px';
                item.currentFontSize = val;
                const valEl = document.getElementById('__ve-prop-fs-val');
                if (valEl) valEl.textContent = val;
            });

            // 圆角
            bindInput('__ve-prop-br', (e) => {
                const val = parseInt(e.target.value);
                const cloneEl = w.children[0];
                if (cloneEl) cloneEl.style.borderRadius = val + 'px';
                item.currentBorderRadius = val;
                const valEl = document.getElementById('__ve-prop-br-val');
                if (valEl) valEl.textContent = val;
            });

            // 透明度
            bindInput('__ve-prop-op', (e) => {
                const val = parseInt(e.target.value) / 100;
                w.style.opacity = val;
                item.currentOpacity = val;
                const valEl = document.getElementById('__ve-prop-op-val');
                if (valEl) valEl.textContent = Math.round(val * 100);
            });
        }

        function updateSizeLabel(idx) {
            const item = editableItems[idx];
            if (!item) return;
            const sl = item.wrapper.querySelector('.__ve-size-label');
            if (sl) sl.textContent = `${Math.round(parseFloat(item.wrapper.style.width))}×${Math.round(parseFloat(item.wrapper.style.height))}`;
        }

        // 选中元素的视觉效果
        function selectItem(idx) {
            // 清除上一个选中态
            editableItems.forEach((item, i) => {
                item.wrapper.style.outline = i === idx ? '2px solid #6366f1' : '1px dashed rgba(99,102,241,0.25)';
                const handles = item.wrapper.querySelectorAll('.__ve-handle');
                handles.forEach(h => h.style.opacity = i === idx ? '1' : '0');
                const sl = item.wrapper.querySelector('.__ve-size-label');
                if (sl) sl.style.opacity = i === idx ? '1' : '0';
            });
            selectedIdx = idx;
            updatePropsPanel(idx);
            // 删除按钮状态
            const delBtn = document.getElementById('__ve-delete');
            if (delBtn) {
                delBtn.style.opacity = idx >= 0 ? '1' : '0.4';
                delBtn.style.pointerEvents = idx >= 0 ? 'auto' : 'none';
            }
        }

        // 为每个子元素创建可编辑的克隆
        const editableItems = [];
        originalStates.forEach((state, idx) => {
            const clone = state.el.cloneNode(true);
            const wrapper = document.createElement('div');
            wrapper.className = '__ve-item';
            wrapper.dataset.index = idx;
            wrapper.style.cssText = `
                position: absolute;
                left: ${state.left}px;
                top: ${state.top}px;
                width: ${state.width}px;
                height: ${state.height}px;
                cursor: move;
                outline: 1px dashed rgba(99,102,241,0.25);
                overflow: visible;
            `;

            // 克隆内容 — 复制完整计算样式，确保外观一致
            const computedStyle = window.getComputedStyle(state.el);
            const stylesToCopy = [
                'color','background','background-color','background-image','background-size',
                'font-family','font-size','font-weight','font-style','line-height','letter-spacing',
                'text-align','text-decoration','text-transform','white-space','word-break',
                'padding','padding-top','padding-right','padding-bottom','padding-left',
                'border','border-radius','box-shadow','text-shadow',
                'display','flex-direction','flex-wrap','justify-content','align-items','gap',
                'grid-template-columns','grid-template-rows','grid-gap',
                'overflow','opacity','transform','transition',
                'box-sizing','vertical-align'
            ];
            let cloneCSS = stylesToCopy.map(p => `${p}:${computedStyle.getPropertyValue(p)}`).join(';');
            clone.style.cssText = cloneCSS + ';width:100%;height:100%;margin:0;position:relative;pointer-events:none;overflow:hidden;';
            // 递ively fix child styles too
            copyChildStyles(state.el, clone);
            wrapper.appendChild(clone);

            // 8 方向缩放手柄
            const handlePositions = [
                { cursor: 'nwse-resize', pos: 'top:-4px;left:-4px;', dir: 'nw' },
                { cursor: 'ns-resize',   pos: 'top:-4px;left:calc(50% - 4px);', dir: 'n' },
                { cursor: 'nesw-resize', pos: 'top:-4px;right:-4px;', dir: 'ne' },
                { cursor: 'ew-resize',   pos: 'top:calc(50% - 4px);right:-4px;', dir: 'e' },
                { cursor: 'nwse-resize', pos: 'bottom:-4px;right:-4px;', dir: 'se' },
                { cursor: 'ns-resize',   pos: 'bottom:-4px;left:calc(50% - 4px);', dir: 's' },
                { cursor: 'nesw-resize', pos: 'bottom:-4px;left:-4px;', dir: 'sw' },
                { cursor: 'ew-resize',   pos: 'top:calc(50% - 4px);left:-4px;', dir: 'w' },
            ];
            handlePositions.forEach(hp => {
                const h = document.createElement('div');
                h.className = '__ve-handle';
                h.dataset.dir = hp.dir;
                h.style.cssText = `
                    position:absolute;${hp.pos}
                    width:8px;height:8px;background:#6366f1;
                    border:1px solid #fff;border-radius:1px;
                    cursor:${hp.cursor};z-index:3;
                    opacity:0;transition:opacity 0.1s;
                `;
                wrapper.appendChild(h);
            });

            // 尺寸标签
            const sizeLabel = document.createElement('div');
            sizeLabel.className = '__ve-size-label';
            sizeLabel.style.cssText = `
                position: absolute; bottom: -20px; left: 0;
                font-size: 10px; color: #89b4fa; white-space: nowrap;
                font-family: monospace; opacity: 0; transition: opacity 0.15s;
                background: rgba(30,30,46,0.9); padding: 1px 6px; border-radius: 3px;
            `;
            sizeLabel.textContent = `${Math.round(state.width)}×${Math.round(state.height)}`;
            wrapper.appendChild(sizeLabel);

            // 点击选中
            wrapper.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('__ve-handle')) return;
                e.preventDefault();
                selectItem(idx);
            });

            // 双击内联编辑文字
            wrapper.addEventListener('dblclick', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (editingTextIdx >= 0) return; // 已在编辑中
                editingTextIdx = idx;

                const textEl = clone.querySelector('h1,h2,h3,h4,h5,h6,p,span,a,button,label,td,th,li,div') || clone;
                const currentText = textEl.textContent || '';
                clone.style.pointerEvents = 'auto';

                // 创建内联编辑框
                const editBox = document.createElement('div');
                editBox.className = '__ve-text-edit';
                editBox.contentEditable = 'true';
                editBox.textContent = currentText;
                editBox.style.cssText = `
                    position:absolute;top:0;left:0;right:0;bottom:0;
                    background:rgba(99,102,241,0.08);
                    border:2px solid #6366f1;border-radius:4px;
                    color:inherit;font:inherit;padding:4px 8px;
                    outline:none;overflow:auto;z-index:5;
                    white-space:pre-wrap;word-break:break-word;
                    display:flex;align-items:center;
                    font-size:${window.getComputedStyle(textEl).fontSize};
                    color:${window.getComputedStyle(textEl).color};
                    cursor:text;
                `;
                wrapper.appendChild(editBox);
                wrapper.style.cursor = 'text';

                // 选中所有文字
                setTimeout(() => {
                    editBox.focus();
                    const range = document.createRange();
                    range.selectNodeContents(editBox);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }, 50);

                const finishEdit = (save) => {
                    if (editingTextIdx !== idx) return;
                    editingTextIdx = -1;
                    const newText = editBox.textContent.trim();
                    editBox.remove();
                    wrapper.style.cursor = 'move';
                    clone.style.pointerEvents = 'none';
                    if (save && newText !== currentText) {
                        textEl.textContent = newText;
                        editableItems[idx].textChanged = newText;
                    }
                };

                editBox.addEventListener('keydown', (ke) => {
                    ke.stopPropagation();
                    if (ke.key === 'Enter' && !ke.shiftKey) { ke.preventDefault(); finishEdit(true); }
                    if (ke.key === 'Escape') { ke.preventDefault(); finishEdit(false); }
                });
                editBox.addEventListener('blur', () => finishEdit(true));
            });

            editableItems.push({
                wrapper,
                clone,
                original: state,
                textChanged: null,
                currentBg: null,
                currentColor: null,
                currentFontSize: null,
                currentBorderRadius: undefined,
                currentOpacity: undefined,
            });

            stage.appendChild(wrapper);
        });

        // 全局鼠标事件（拖拽 + 多方向缩放）
        let activeAction = null; // { type: 'drag'|'resize', idx, ... }

        const onMouseMove = (e) => {
            if (!activeAction) return;
            const item = editableItems[activeAction.idx];
            const w = item.wrapper;

            if (activeAction.type === 'drag') {
                const newLeft = activeAction.origLeft + e.clientX - activeAction.startX;
                const newTop = activeAction.origTop + e.clientY - activeAction.startY;
                w.style.left = newLeft + 'px';
                w.style.top = newTop + 'px';
                // 同步属性面板
                const xEl = document.getElementById('__ve-prop-x');
                const yEl = document.getElementById('__ve-prop-y');
                if (xEl) xEl.value = Math.round(newLeft);
                if (yEl) yEl.value = Math.round(newTop);
            }

            if (activeAction.type === 'resize') {
                const dx = e.clientX - activeAction.startX;
                const dy = e.clientY - activeAction.startY;
                const dir = activeAction.dir;
                let { origLeft, origTop, origW, origH } = activeAction;
                let newL = origLeft, newT = origTop, newW = origW, newH = origH;

                // 根据方向计算新的位置和尺寸
                if (dir.includes('e')) { newW = Math.max(20, origW + dx); }
                if (dir.includes('w')) { newW = Math.max(20, origW - dx); newL = origLeft + (origW - newW); }
                if (dir.includes('s')) { newH = Math.max(20, origH + dy); }
                if (dir.includes('n')) { newH = Math.max(20, origH - dy); newT = origTop + (origH - newH); }

                w.style.left = newL + 'px';
                w.style.top = newT + 'px';
                w.style.width = newW + 'px';
                w.style.height = newH + 'px';
                updateSizeLabel(activeAction.idx);

                // 同步属性面板
                const xEl = document.getElementById('__ve-prop-x');
                const yEl = document.getElementById('__ve-prop-y');
                const wEl = document.getElementById('__ve-prop-w');
                const hEl = document.getElementById('__ve-prop-h');
                if (xEl) xEl.value = Math.round(newL);
                if (yEl) yEl.value = Math.round(newT);
                if (wEl) wEl.value = Math.round(newW);
                if (hEl) hEl.value = Math.round(newH);
            }
        };

        const onMouseUp = () => {
            activeAction = null;
        };

        // 绑定拖拽和多方向缩放
        editableItems.forEach((item, idx) => {
            // 拖拽
            item.wrapper.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('__ve-handle')) return;
                if (editingTextIdx >= 0) return;
                selectItem(idx);
                activeAction = {
                    type: 'drag', idx,
                    startX: e.clientX, startY: e.clientY,
                    origLeft: parseFloat(item.wrapper.style.left),
                    origTop: parseFloat(item.wrapper.style.top)
                };
            });

            // 8 方向缩放手柄
            item.wrapper.querySelectorAll('.__ve-handle').forEach(h => {
                h.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectItem(idx);
                    activeAction = {
                        type: 'resize', idx,
                        dir: h.dataset.dir,
                        startX: e.clientX, startY: e.clientY,
                        origLeft: parseFloat(item.wrapper.style.left),
                        origTop: parseFloat(item.wrapper.style.top),
                        origW: parseFloat(item.wrapper.style.width),
                        origH: parseFloat(item.wrapper.style.height)
                    };
                });
            });
        });

        editor.addEventListener('mousemove', onMouseMove);
        editor.addEventListener('mouseup', onMouseUp);

        // 点击画布空白取消选中
        canvas.addEventListener('mousedown', (e) => {
            if (e.target === canvas || e.target === stage) {
                selectItem(-1);
            }
        });

        canvas.appendChild(stage);
        body.appendChild(canvas);
        body.appendChild(propsPanel);
        editor.appendChild(body);
        document.body.appendChild(editor);

        // 按钮事件
        document.getElementById('__ve-cancel').addEventListener('click', () => editor.remove());

        // 删除选中元素
        document.getElementById('__ve-delete').addEventListener('click', () => {
            if (selectedIdx < 0 || selectedIdx >= editableItems.length) return;
            const item = editableItems[selectedIdx];
            item.wrapper.style.display = 'none';
            item.deleted = true;
            selectItem(-1);
        });

        document.getElementById('__ve-reset').addEventListener('click', () => {
            editableItems.forEach((item) => {
                const s = item.original;
                item.wrapper.style.left = s.left + 'px';
                item.wrapper.style.top = s.top + 'px';
                item.wrapper.style.width = s.width + 'px';
                item.wrapper.style.height = s.height + 'px';
                item.wrapper.style.opacity = s.opacity;
                item.wrapper.style.display = ''; // 恢复删除的元素
                item.textChanged = null;
                item.currentBg = null;
                item.currentColor = null;
                item.currentFontSize = null;
                item.currentBorderRadius = undefined;
                item.currentOpacity = undefined;
                item.deleted = false;
                // 重置克隆元素样式
                const cloneEl = item.wrapper.children[0];
                if (cloneEl) {
                    cloneEl.style.backgroundColor = '';
                    cloneEl.style.color = '';
                    cloneEl.style.fontSize = '';
                    cloneEl.style.borderRadius = '';
                }
                updateSizeLabel(editableItems.indexOf(item));
            });
            if (selectedIdx >= 0) updatePropsPanel(selectedIdx);
        });

        document.getElementById('__ve-confirm').addEventListener('click', () => {
            // 收集变更（包含样式属性）
            const changes = [];
            editableItems.forEach((item) => {
                const orig = item.original;

                // 删除的元素
                if (item.deleted) {
                    changes.push({
                        selector: orig.selector,
                        classNames: orig.classNames,
                        text: orig.text,
                        changes: ['删除此元素'],
                        deleted: true
                    });
                    return;
                }

                const newLeft = parseFloat(item.wrapper.style.left);
                const newTop = parseFloat(item.wrapper.style.top);
                const newW = parseFloat(item.wrapper.style.width);
                const newH = parseFloat(item.wrapper.style.height);

                const diffs = [];
                const dx = Math.round(newLeft - orig.left);
                const dy = Math.round(newTop - orig.top);
                const dw = Math.round(newW - orig.width);
                const dh = Math.round(newH - orig.height);

                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                    diffs.push(`移动: x${dx > 0 ? '+' : ''}${dx}px, y${dy > 0 ? '+' : ''}${dy}px`);
                }
                if (Math.abs(dw) > 2 || Math.abs(dh) > 2) {
                    diffs.push(`缩放: ${Math.round(orig.width)}×${Math.round(orig.height)} → ${Math.round(newW)}×${Math.round(newH)}`);
                }
                if (item.textChanged !== null) {
                    diffs.push(`文字改为: "${item.textChanged}"`);
                }
                if (item.currentBg) {
                    diffs.push(`背景色改为: ${item.currentBg}`);
                }
                if (item.currentColor) {
                    diffs.push(`文字颜色改为: ${item.currentColor}`);
                }
                if (item.currentFontSize && item.currentFontSize !== orig.fontSize) {
                    diffs.push(`字号改为: ${item.currentFontSize}px`);
                }
                if (item.currentBorderRadius !== undefined && item.currentBorderRadius !== orig.borderRadius) {
                    diffs.push(`圆角改为: ${item.currentBorderRadius}px`);
                }
                if (item.currentOpacity !== undefined && Math.abs(item.currentOpacity - orig.opacity) > 0.01) {
                    diffs.push(`透明度改为: ${Math.round(item.currentOpacity * 100)}%`);
                }

                if (diffs.length > 0) {
                    changes.push({
                        selector: orig.selector,
                        classNames: orig.classNames,
                        text: orig.text,
                        changes: diffs,
                        newPosition: { left: Math.round(newLeft), top: Math.round(newTop) },
                        newSize: { width: Math.round(newW), height: Math.round(newH) },
                        originalPosition: { left: Math.round(orig.left), top: Math.round(orig.top) },
                        originalSize: { width: Math.round(orig.width), height: Math.round(orig.height) },
                        newText: item.textChanged,
                        newBg: item.currentBg,
                        newColor: item.currentColor,
                        newFontSize: item.currentFontSize,
                        newBorderRadius: item.currentBorderRadius,
                        newOpacity: item.currentOpacity
                    });
                }
            });

            editor.remove();

            if (changes.length === 0) {
                selectAndOpenDialog(containerEl);
                return;
            }

            // 生成可视化变更描述
            let desc = '根据可视化编辑结果，请做以下调整：\n\n';
            changes.forEach((c, i) => {
                desc += `### 元素 ${i + 1}: \`${c.classNames || c.selector}\`\n`;
                if (c.text) desc += `（文本: "${c.text}"）\n`;
                c.changes.forEach(d => { desc += `- ${d}\n`; });
                desc += '\n';
            });

            selectAndOpenDialog(containerEl, { description: desc, changes });
        });

        // ESC 关闭（但编辑文字时不关闭编辑器）
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                if (editingTextIdx >= 0) return; // 编辑文字中的 ESC 由编辑框自行处理
                editor.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // ========== 子元素选择面板（半透明可拖拽 + 多选）==========
    function showSubElementPanel(containerEl) {
        const old = document.getElementById('__picker-subpanel');
        if (old) old.remove();

        // 不再用全屏遮罩，直接浮动面板
        const panel = document.createElement('div');
        panel.id = '__picker-subpanel';
        panel.style.cssText = `
            position: fixed; top: 60px; right: 24px;
            width: 420px; max-width: 90vw; max-height: 75vh;
            background: rgba(30, 30, 46, 0.92); backdrop-filter: blur(12px);
            border-radius: 16px; padding: 0;
            overflow: hidden; box-shadow: 0 16px 60px rgba(0,0,0,0.5);
            color: #cdd6f4; font-family: 'Segoe UI', system-ui, sans-serif;
            z-index: 2147483645; border: 1px solid rgba(99,102,241,0.3);
            cursor: default;
        `;

        // 可拖拽标题栏
        const header = document.createElement('div');
        header.style.cssText = `
            display:flex; justify-content:space-between; align-items:center;
            padding: 14px 18px; cursor: move; user-select: none;
            background: rgba(49, 50, 68, 0.8); border-bottom: 1px solid #45475a;
        `;
        header.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:14px;font-weight:600;color:#cba6f7;">选择元素</span>
                <span id="__picker-select-count" style="font-size:11px;color:#6c7086;background:#313244;padding:2px 8px;border-radius:10px;">0 已选</span>
            </div>
            <button id="__picker-subpanel-close" style="background:none;border:none;color:#6c7086;font-size:18px;cursor:pointer;padding:2px 6px;border-radius:4px;">✕</button>
        `;
        panel.appendChild(header);

        // 拖拽逻辑
        let isDragging = false, dragX = 0, dragY = 0;
        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            isDragging = true;
            dragX = e.clientX - panel.offsetLeft;
            dragY = e.clientY - panel.offsetTop;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            panel.style.left = (e.clientX - dragX) + 'px';
            panel.style.top = (e.clientY - dragY) + 'px';
            panel.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => { isDragging = false; });

        // 内容区域（可滚动）
        const content = document.createElement('div');
        content.style.cssText = 'padding: 12px 18px; overflow-y: auto; max-height: calc(75vh - 110px);';

        // 多选状态
        const selectedSet = new Set();
        const childElements = [];

        function updateCount() {
            const countEl = document.getElementById('__picker-select-count');
            if (countEl) countEl.textContent = `${selectedSet.size} 已选`;
            // 确认按钮状态
            const confirmBtn = document.getElementById('__picker-confirm-multi');
            if (confirmBtn) {
                confirmBtn.style.opacity = selectedSet.size > 0 ? '1' : '0.4';
                confirmBtn.style.pointerEvents = selectedSet.size > 0 ? 'auto' : 'none';
            }
        }

        // "选择整个容器" 行
        const containerTag = containerEl.tagName.toLowerCase();
        const containerCls = containerEl.className && typeof containerEl.className === 'string'
            ? '.' + containerEl.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
        const containerRow = document.createElement('div');
        containerRow.style.cssText = `
            padding: 8px 12px; margin-bottom: 8px; background: rgba(99,102,241,0.1);
            border: 1px solid rgba(99,102,241,0.3); border-radius: 8px; cursor: pointer;
            transition: all 0.2s; display: flex; align-items: center; gap: 8px;
        `;
        containerRow.innerHTML = `
            <span style="background:#6366f1;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-family:monospace;">${containerTag}${containerCls}</span>
            <span style="font-size:12px;color:#a6adc8;">整个容器</span>
        `;
        containerRow.addEventListener('mouseenter', () => highlightElement(containerEl));
        containerRow.addEventListener('mouseleave', () => { overlayBox.style.display = 'none'; labelBox.style.display = 'none'; });
        containerRow.addEventListener('click', () => {
            closePanel();
            selectAndOpenDialog(containerEl);
        });
        content.appendChild(containerRow);

        // 分割线 + 子元素标题
        const subHeader = document.createElement('div');
        subHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin:10px 0 8px;';
        subHeader.innerHTML = `
            <span style="font-size:11px;color:#6c7086;">子元素 (${containerEl.children.length})</span>
            <label style="font-size:11px;color:#89b4fa;cursor:pointer;user-select:none;" id="__picker-select-all">全选</label>
        `;
        content.appendChild(subHeader);

        // 子元素列表
        const children = Array.from(containerEl.children);
        children.forEach((child, i) => {
            if (isPickerElement(child)) return;
            childElements.push(child);

            const tag = child.tagName.toLowerCase();
            const cls = child.className && typeof child.className === 'string'
                ? '.' + child.className.split(' ').filter(Boolean).slice(0, 2).join('.') : '';
            const text = (child.textContent || '').substring(0, 50).trim();
            const rect = child.getBoundingClientRect();
            const dims = `${Math.round(rect.width)}×${Math.round(rect.height)}`;

            const item = document.createElement('div');
            item.style.cssText = `
                padding: 6px 10px; margin-bottom: 3px; background: transparent;
                border: 1px solid transparent; border-radius: 6px; cursor: pointer;
                transition: all 0.15s; display: flex; align-items: center; gap: 8px;
                font-size: 12px;
            `;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.style.cssText = 'accent-color: #6366f1; cursor: pointer; flex-shrink: 0;';

            const label = document.createElement('div');
            label.style.cssText = 'display:flex;align-items:center;gap:6px;flex:1;overflow:hidden;';
            label.innerHTML = `
                <span style="color:#6c7086;font-size:10px;min-width:16px;">${i + 1}</span>
                <span style="background:#313244;color:#cdd6f4;padding:1px 5px;border-radius:3px;font-size:10px;font-family:monospace;white-space:nowrap;">${tag}${cls}</span>
                <span style="color:#a6adc8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${text || '(空)'}</span>
                <span style="color:#585b70;font-size:10px;white-space:nowrap;">${dims}</span>
            `;

            item.appendChild(checkbox);
            item.appendChild(label);

            // 悬停高亮
            item.addEventListener('mouseenter', () => {
                item.style.background = 'rgba(99,102,241,0.08)';
                item.style.borderColor = 'rgba(99,102,241,0.2)';
                highlightElement(child);
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = checkbox.checked ? 'rgba(99,102,241,0.1)' : 'transparent';
                item.style.borderColor = checkbox.checked ? 'rgba(99,102,241,0.3)' : 'transparent';
                overlayBox.style.display = 'none';
                labelBox.style.display = 'none';
            });

            // 点击行 = 切换选中
            item.addEventListener('click', (e) => {
                if (e.target !== checkbox) checkbox.checked = !checkbox.checked;
                if (checkbox.checked) {
                    selectedSet.add(i);
                    item.style.background = 'rgba(99,102,241,0.1)';
                    item.style.borderColor = 'rgba(99,102,241,0.3)';
                } else {
                    selectedSet.delete(i);
                    item.style.background = 'transparent';
                    item.style.borderColor = 'transparent';
                }
                updateCount();
            });

            content.appendChild(item);
        });

        panel.appendChild(content);

        // 底部操作栏
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 18px; border-top: 1px solid #45475a;
            display: flex; justify-content: flex-end; gap: 8px;
            background: rgba(49, 50, 68, 0.6);
        `;
        footer.innerHTML = `
            <button id="__picker-visual-edit" style="
                padding:6px 16px; border:1px solid #f59e0b; background:transparent;
                color:#f59e0b; border-radius:8px; cursor:pointer; font-size:12px;
                font-family:'Segoe UI',sans-serif; transition:all 0.2s; margin-right:auto;
            ">🎨 可视化编辑</button>
            <button id="__picker-cancel-multi" style="
                padding:6px 16px; border:1px solid #45475a; background:transparent;
                color:#cdd6f4; border-radius:8px; cursor:pointer; font-size:12px;
                font-family:'Segoe UI',sans-serif; transition:all 0.2s;
            ">取消</button>
            <button id="__picker-confirm-multi" style="
                padding:6px 16px; border:none;
                background:linear-gradient(135deg,#6366f1,#8b5cf6);
                color:white; border-radius:8px; cursor:pointer; font-size:12px;
                font-weight:600; font-family:'Segoe UI',sans-serif;
                opacity:0.4; pointer-events:none; transition:all 0.2s;
            ">确认选择 →</button>
        `;
        panel.appendChild(footer);

        document.body.appendChild(panel);

        // 事件绑定
        function closePanel() {
            panel.remove();
            overlayBox.style.display = 'none';
            labelBox.style.display = 'none';
        }

        document.getElementById('__picker-subpanel-close').addEventListener('click', closePanel);
        document.getElementById('__picker-cancel-multi').addEventListener('click', closePanel);

        // 全选
        document.getElementById('__picker-select-all').addEventListener('click', () => {
            const allSelected = selectedSet.size === childElements.length;
            const checkboxes = content.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach((cb, idx) => {
                cb.checked = !allSelected;
                const row = cb.parentElement;
                if (!allSelected) {
                    selectedSet.add(idx);
                    row.style.background = 'rgba(99,102,241,0.1)';
                    row.style.borderColor = 'rgba(99,102,241,0.3)';
                } else {
                    selectedSet.delete(idx);
                    row.style.background = 'transparent';
                    row.style.borderColor = 'transparent';
                }
            });
            document.getElementById('__picker-select-all').textContent = allSelected ? '全选' : '取消全选';
            updateCount();
        });

        // 确认多选
        document.getElementById('__picker-confirm-multi').addEventListener('click', () => {
            const selected = [...selectedSet].sort().map(idx => childElements[idx]);
            closePanel();
            if (selected.length === 1) {
                // 单选且有子元素 → 继续展开
                if (selected[0].children.length > 1) {
                    showSubElementPanel(selected[0]);
                } else {
                    selectAndOpenDialog(selected[0]);
                }
            } else {
                selectAndOpenDialog(selected);
            }
        });

        // 可视化编辑按钮
        document.getElementById('__picker-visual-edit').addEventListener('click', () => {
            closePanel();
            showVisualEditor(containerEl, childElements);
        });
    }

    // ========== 快捷键 ==========
    document.addEventListener('keydown', (e) => {
        // ESC 退出选择模式
        if (e.key === 'Escape' && isPickerActive) {
            togglePicker();
        }
        // Alt+P 切换选择模式
        if (e.altKey && e.key.toLowerCase() === 'p') {
            e.preventDefault();
            togglePicker();
        }
    });

    // ========== 元素截图 ==========
    async function captureElementScreenshot(el) {
        try {
            const rect = el.getBoundingClientRect();
            // 使用 Canvas 裁剪可视区域
            const canvas = document.createElement('canvas');
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.min(rect.width * dpr, 1200);
            canvas.height = Math.min(rect.height * dpr, 800);
            const ctx = canvas.getContext('2d');

            // 尝试用 html2canvas（如果页面已加载），否则跳过
            // 这里我们用一种简单方式：直接用 SVG foreignObject
            const svgData = `
                <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
                    <foreignObject width="100%" height="100%">
                        <div xmlns="http://www.w3.org/1999/xhtml">
                            ${el.outerHTML}
                        </div>
                    </foreignObject>
                </svg>`;
            // Note: foreignObject 方式受限于 CORS 和外部样式，
            // 在很多场景下不可靠，暂时返回 null
            return null;
        } catch (err) {
            console.warn('[Picker] Screenshot failed:', err);
            return null;
        }
    }

    // ========== 辅助函数 ==========
    function isPickerElement(el) {
        if (!el) return false;
        // 检查 el 及其祖先是否是 picker/dialog 相关
        let node = el;
        while (node) {
            if (node.id && (node.id.startsWith('__picker-') || node.id.startsWith('__dialog-'))) {
                return true;
            }
            node = node.parentElement;
        }
        return false;
    }

    function highlightElement(el) {
        const rect = el.getBoundingClientRect();
        overlayBox.style.display = 'block';
        overlayBox.style.top = rect.top + 'px';
        overlayBox.style.left = rect.left + 'px';
        overlayBox.style.width = rect.width + 'px';
        overlayBox.style.height = rect.height + 'px';

        // 标签
        const tagName = el.tagName.toLowerCase();
        const id = el.id && !el.id.startsWith('__picker') && !el.id.startsWith('__dialog') ? `#${el.id}` : '';
        const classes = Array.from(el.classList)
            .filter(c => !c.startsWith('__picker') && !c.startsWith('__dialog'))
            .slice(0, 3)
            .map(c => `.${c}`)
            .join('');
        const dims = `${Math.round(rect.width)}×${Math.round(rect.height)}`;
        labelBox.textContent = `${tagName}${id}${classes}  ${dims}`;
        labelBox.style.display = 'block';
        labelBox.style.top = Math.max(0, rect.top - 24) + 'px';
        labelBox.style.left = rect.left + 'px';
    }

    function getElementInfo(el) {
        return {
            selector: getCSSSelector(el),
            outerHTML: getSmartHTML(el),
            computedStyles: getKeyStyles(el),
            tagName: el.tagName.toLowerCase(),
            textContent: (el.textContent || '').substring(0, 300),
            directText: getDirectText(el),
            childSummary: getChildSummary(el),
            classNames: el.className && typeof el.className === 'string' ? el.className.trim() : '',
            ancestorChain: getAncestorChain(el, 3),
            frameworkInfo: detectFrameworkInfo(el),
            identifiers: getIdentifierAttributes(el),
            rect: el.getBoundingClientRect(),
            pageUrl: window.location.href,
            elementScreenshot: null
        };
    }

    // 向上获取祖先链（tag + id + class）
    function getAncestorChain(el, levels) {
        const chain = [];
        let current = el.parentElement;
        while (current && current !== document.body && current !== document.documentElement && chain.length < levels) {
            const tag = current.tagName.toLowerCase();
            const id = current.id && !current.id.startsWith('__') ? '#' + current.id : '';
            const cls = current.className && typeof current.className === 'string'
                ? '.' + current.className.split(' ').filter(Boolean).slice(0, 3).join('.')
                : '';
            chain.push(tag + id + cls);
            current = current.parentElement;
        }
        return chain.reverse().join(' > ');
    }

    // 检测前端框架和组件名
    function detectFrameworkInfo(el) {
        const result = { framework: null, componentName: null };
        try {
            // React
            const reactKey = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
            if (reactKey) {
                result.framework = 'react';
                let fiber = el[reactKey];
                // 沿 fiber.return 向上找有 name 的组件（跳过 Host/DOM 节点）
                for (let i = 0; i < 10 && fiber; i++) {
                    if (fiber.type && typeof fiber.type === 'function') {
                        const name = fiber.type.displayName || fiber.type.name;
                        if (name && name !== 'Anonymous' && !name.startsWith('_')) {
                            result.componentName = name;
                            break;
                        }
                    }
                    fiber = fiber.return;
                }
                return result;
            }

            // Vue 3
            const vueKey = Object.keys(el).find(k => k.startsWith('__vueParentComponent'));
            if (vueKey || el.__vueParentComponent) {
                result.framework = 'vue';
                const comp = el.__vueParentComponent || el[vueKey];
                if (comp && comp.type) {
                    result.componentName = comp.type.name || comp.type.__name || null;
                }
                return result;
            }

            // Vue 2
            if (el.__vue__) {
                result.framework = 'vue';
                result.componentName = el.__vue__.$options.name || el.__vue__.$options._componentTag || null;
                return result;
            }

            // Angular
            const ngKey = Object.keys(el).find(k => k.startsWith('__ng'));
            if (ngKey) {
                result.framework = 'angular';
                return result;
            }

            // Svelte
            if (el.__svelte_meta) {
                result.framework = 'svelte';
                return result;
            }
        } catch (e) {
            console.warn('[Picker] Framework detection error:', e);
        }
        return result;
    }

    // 提取稳定标识属性
    function getIdentifierAttributes(el) {
        const attrs = {};
        const keys = ['data-testid', 'data-cy', 'data-test', 'data-id', 'role', 'aria-label', 'aria-labelledby', 'name', 'id'];
        keys.forEach(k => {
            const v = el.getAttribute(k);
            if (v && !v.startsWith('__picker') && !v.startsWith('__dialog')) {
                attrs[k] = v;
            }
        });
        return Object.keys(attrs).length > 0 ? attrs : null;
    }

    // 智能 HTML：如果子元素太多，只返回开标签 + 直接子元素摘要
    function getSmartHTML(el) {
        const childCount = el.children.length;
        if (childCount <= 3 && el.outerHTML.length <= 1500) {
            return el.outerHTML.substring(0, 1500);
        }
        // 只返回开标签
        const tag = el.tagName.toLowerCase();
        const attrs = Array.from(el.attributes)
            .map(a => `${a.name}="${a.value}"`)
            .join(' ');
        const openTag = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;
        // 加上直接子元素的简要描述
        const childTags = Array.from(el.children).slice(0, 5)
            .map(c => {
                const cTag = c.tagName.toLowerCase();
                const cClass = c.className && typeof c.className === 'string'
                    ? '.' + c.className.split(' ').filter(Boolean).slice(0, 2).join('.')
                    : '';
                return `<${cTag}${cClass}>`;
            });
        return `${openTag}\n  <!-- ${childCount} 个子元素: ${childTags.join(', ')}${childCount > 5 ? ', ...' : ''} -->\n</${tag}>`;
    }

    // 获取元素自身的直接文本（不含子元素文本）
    function getDirectText(el) {
        let text = '';
        for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent.trim();
            }
        }
        return text.substring(0, 200);
    }

    // 子元素摘要
    function getChildSummary(el) {
        if (el.children.length === 0) return '';
        return Array.from(el.children).slice(0, 8).map(c => {
            const tag = c.tagName.toLowerCase();
            const text = (c.textContent || '').substring(0, 50).trim();
            return `${tag}: "${text}"`;
        }).join('\n');
    }

    function getCSSSelector(el) {
        if (el.id && !el.id.startsWith('__picker') && !el.id.startsWith('__dialog')) {
            return '#' + CSS.escape(el.id);
        }
        const parts = [];
        let current = el;
        while (current && current !== document.body && current !== document.documentElement && parts.length < 5) {
            let selector = current.tagName.toLowerCase();
            if (current.id && !current.id.startsWith('__')) {
                selector = '#' + CSS.escape(current.id);
                parts.unshift(selector);
                break;
            }
            if (current.className && typeof current.className === 'string') {
                const validClasses = current.className.split(' ')
                    .filter(c => c && !c.startsWith('__'))
                    .slice(0, 2);
                if (validClasses.length) {
                    selector += '.' + validClasses.map(c => CSS.escape(c)).join('.');
                }
            }
            // nth-of-type (更稳定)
            const parent = current.parentElement;
            if (parent) {
                const sameTagSiblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
                if (sameTagSiblings.length > 1) {
                    const index = sameTagSiblings.indexOf(current) + 1;
                    selector += `:nth-of-type(${index})`;
                }
            }
            parts.unshift(selector);
            current = current.parentElement;
        }
        return parts.join(' > ');
    }

    function getKeyStyles(el) {
        const computed = window.getComputedStyle(el);
        const keys = [
            'color', 'background-color', 'background',
            'font-size', 'font-weight', 'font-family',
            'padding', 'margin', 'border', 'border-radius',
            'display', 'position', 'width', 'height',
            'text-align', 'line-height', 'box-shadow',
            'flex-direction', 'justify-content', 'align-items', 'gap'
        ];
        return keys
            .map(k => `${k}: ${computed.getPropertyValue(k)}`)
            .filter(s => !s.endsWith(': ') && !s.endsWith(': none') && !s.endsWith(': normal') && !s.endsWith(': 0px'))
            .join(';\n');
    }
})();
