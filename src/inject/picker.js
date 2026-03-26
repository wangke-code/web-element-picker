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
                setTimeout(() => {
                    undoBtn.innerHTML = '↩';
                }, 2000);
            }
        } catch (err) {
            undoBtn.innerHTML = '✕';
            setTimeout(() => {
                undoBtn.innerHTML = '↩';
            }, 2000);
        }
    });
    document.body.appendChild(undoBtn);

    // 暴露显示撤销按钮的方法
    window.__webPickerShowUndo = function() {
        undoBtn.style.display = 'flex';
    };

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

    // ========== 可视化编辑器 ==========
    function showVisualEditor(containerEl, selectedElements) {
        const old = document.getElementById('__picker-visual-editor');
        if (old) old.remove();

        const containerRect = containerEl.getBoundingClientRect();
        const containerStyles = window.getComputedStyle(containerEl);

        // 记录每个子元素的原始位置
        const elements = selectedElements || Array.from(containerEl.children).filter(c => !isPickerElement(c));
        const originalStates = elements.map(el => {
            const r = el.getBoundingClientRect();
            return {
                el,
                left: r.left - containerRect.left,
                top: r.top - containerRect.top,
                width: r.width,
                height: r.height,
                selector: getCSSSelector(el),
                classNames: el.className && typeof el.className === 'string' ? el.className.trim() : '',
                text: (el.textContent || '').substring(0, 40).trim()
            };
        });

        // 全屏编辑器背景
        const editor = document.createElement('div');
        editor.id = '__picker-visual-editor';
        editor.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 15, 25, 0.85); backdrop-filter: blur(6px);
            z-index: 2147483645; display: flex; flex-direction: column;
        `;

        // 顶部工具栏
        const toolbar = document.createElement('div');
        toolbar.style.cssText = `
            display: flex; justify-content: space-between; align-items: center;
            padding: 12px 24px; background: rgba(30,30,46,0.95);
            border-bottom: 1px solid #45475a; flex-shrink: 0;
        `;
        toolbar.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:14px;font-weight:600;color:#cba6f7;font-family:'Segoe UI',sans-serif;">🎨 可视化编辑</span>
                <span style="font-size:11px;color:#6c7086;font-family:'Segoe UI',sans-serif;">拖拽移动 · 拖角缩放 · 双击编辑文字</span>
            </div>
            <div style="display:flex;gap:8px;">
                <button id="__ve-reset" style="padding:6px 14px;border:1px solid #45475a;background:transparent;color:#cdd6f4;border-radius:8px;cursor:pointer;font-size:12px;font-family:'Segoe UI',sans-serif;">重置</button>
                <button id="__ve-cancel" style="padding:6px 14px;border:1px solid #45475a;background:transparent;color:#cdd6f4;border-radius:8px;cursor:pointer;font-size:12px;font-family:'Segoe UI',sans-serif;">取消</button>
                <button id="__ve-confirm" style="padding:6px 14px;border:none;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:'Segoe UI',sans-serif;">确认修改 →</button>
            </div>
        `;
        editor.appendChild(toolbar);

        // 画布区域
        const canvas = document.createElement('div');
        canvas.style.cssText = `
            flex: 1; display: flex; align-items: center; justify-content: center;
            overflow: auto; padding: 40px;
        `;

        // 克隆容器（保持原始外观）
        const stage = document.createElement('div');
        stage.id = '__ve-stage';
        stage.style.cssText = `
            position: relative;
            width: ${containerRect.width}px;
            height: ${containerRect.height}px;
            background: ${containerStyles.background};
            background-color: ${containerStyles.backgroundColor};
            border-radius: ${containerStyles.borderRadius};
            border: 2px dashed rgba(99,102,241,0.4);
            overflow: visible;
            flex-shrink: 0;
        `;

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
                outline: 1px solid transparent;
                transition: outline-color 0.15s;
                overflow: hidden;
            `;

            // 克隆内容
            clone.style.cssText = state.el.getAttribute('style') || '';
            clone.style.width = '100%';
            clone.style.height = '100%';
            clone.style.margin = '0';
            clone.style.position = 'relative';
            clone.style.pointerEvents = 'none';
            wrapper.appendChild(clone);

            // 缩放手柄（右下角）
            const handle = document.createElement('div');
            handle.className = '__ve-resize-handle';
            handle.style.cssText = `
                position: absolute; right: -4px; bottom: -4px;
                width: 10px; height: 10px; background: #6366f1;
                border-radius: 2px; cursor: nwse-resize; z-index: 2;
                opacity: 0; transition: opacity 0.15s;
            `;
            wrapper.appendChild(handle);

            // 尺寸标签
            const sizeLabel = document.createElement('div');
            sizeLabel.className = '__ve-size-label';
            sizeLabel.style.cssText = `
                position: absolute; bottom: -20px; left: 0;
                font-size: 10px; color: #6c7086; white-space: nowrap;
                font-family: monospace; opacity: 0; transition: opacity 0.15s;
            `;
            sizeLabel.textContent = `${Math.round(state.width)}×${Math.round(state.height)}`;
            wrapper.appendChild(sizeLabel);

            // 悬停效果
            wrapper.addEventListener('mouseenter', () => {
                wrapper.style.outlineColor = '#6366f1';
                handle.style.opacity = '1';
                sizeLabel.style.opacity = '1';
            });
            wrapper.addEventListener('mouseleave', () => {
                wrapper.style.outlineColor = 'transparent';
                handle.style.opacity = '0';
                sizeLabel.style.opacity = '0';
            });

            // 拖拽移动 (handled via _drag on editableItems)
            wrapper.addEventListener('mousedown', (e) => {
                if (e.target === handle) return;
                e.preventDefault();
            });

            // 缩放 (handled via _resize on editableItems)
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });

            // 双击编辑文字
            wrapper.addEventListener('dblclick', (e) => {
                e.preventDefault();
                const textEl = clone.querySelector('h1,h2,h3,h4,h5,p,span,a,button,label,td,th,li') || clone;
                const currentText = textEl.textContent;
                const input = prompt('编辑文字内容:', currentText);
                if (input !== null && input !== currentText) {
                    textEl.textContent = input;
                    editableItems[idx].textChanged = input;
                }
            });

            editableItems.push({
                wrapper,
                original: state,
                textChanged: null
            });

            stage.appendChild(wrapper);
        });

        // 全局鼠标事件
        const onMouseMove = (e) => {
            editableItems.forEach((item, idx) => {
                // 拖拽
                if (editableItems[idx]._drag) {
                    const d = editableItems[idx]._drag;
                    item.wrapper.style.left = (d.origLeft + e.clientX - d.startX) + 'px';
                    item.wrapper.style.top = (d.origTop + e.clientY - d.startY) + 'px';
                }
                // 缩放
                if (editableItems[idx]._resize) {
                    const r = editableItems[idx]._resize;
                    const newW = Math.max(20, r.origW + e.clientX - r.startX);
                    const newH = Math.max(20, r.origH + e.clientY - r.startY);
                    item.wrapper.style.width = newW + 'px';
                    item.wrapper.style.height = newH + 'px';
                    const sl = item.wrapper.querySelector('.__ve-size-label');
                    if (sl) sl.textContent = `${Math.round(newW)}×${Math.round(newH)}`;
                }
            });
        };
        const onMouseUp = () => {
            editableItems.forEach((_item, idx) => {
                editableItems[idx]._drag = null;
                editableItems[idx]._resize = null;
            });
        };

        // 绑定拖拽/缩放到各 item
        editableItems.forEach((item, idx) => {
            item.wrapper.addEventListener('mousedown', (e) => {
                if (e.target.className === '__ve-resize-handle') return;
                editableItems[idx]._drag = {
                    startX: e.clientX, startY: e.clientY,
                    origLeft: parseFloat(item.wrapper.style.left),
                    origTop: parseFloat(item.wrapper.style.top)
                };
            });
            const resizeHandle = item.wrapper.querySelector('.__ve-resize-handle');
            if (resizeHandle) {
                resizeHandle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    editableItems[idx]._resize = {
                        startX: e.clientX, startY: e.clientY,
                        origW: parseFloat(item.wrapper.style.width),
                        origH: parseFloat(item.wrapper.style.height)
                    };
                });
            }
        });

        editor.addEventListener('mousemove', onMouseMove);
        editor.addEventListener('mouseup', onMouseUp);

        canvas.appendChild(stage);
        editor.appendChild(canvas);
        document.body.appendChild(editor);

        // 按钮事件
        document.getElementById('__ve-cancel').addEventListener('click', () => editor.remove());

        document.getElementById('__ve-reset').addEventListener('click', () => {
            editableItems.forEach((item, idx) => {
                const s = item.original;
                item.wrapper.style.left = s.left + 'px';
                item.wrapper.style.top = s.top + 'px';
                item.wrapper.style.width = s.width + 'px';
                item.wrapper.style.height = s.height + 'px';
                item.textChanged = null;
                const sl = item.wrapper.querySelector('.__ve-size-label');
                if (sl) sl.textContent = `${Math.round(s.width)}×${Math.round(s.height)}`;
            });
        });

        document.getElementById('__ve-confirm').addEventListener('click', () => {
            // 收集变更
            const changes = [];
            editableItems.forEach((item) => {
                const orig = item.original;
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
                        newText: item.textChanged
                    });
                }
            });

            editor.remove();

            if (changes.length === 0) {
                // 没有变更，直接打开普通对话框
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

            // 打开对话框，预填可视化变更
            selectAndOpenDialog(containerEl, { description: desc, changes });
        });

        // ESC 关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
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
