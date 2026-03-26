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

    // ========== 选中元素并打开对话框 ==========
    function selectAndOpenDialog(el) {
        const info = getElementInfo(el);
        captureElementScreenshot(el).then((screenshot) => {
            info.elementScreenshot = screenshot;
            if (window.__webPickerDialog) {
                window.__webPickerDialog.open(info);
            }
        });
    }

    // ========== 子元素选择面板 ==========
    function showSubElementPanel(containerEl) {
        // 移除旧面板
        const old = document.getElementById('__picker-subpanel');
        if (old) old.remove();

        const panel = document.createElement('div');
        panel.id = '__picker-subpanel';
        panel.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5); z-index: 2147483645;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px);
        `;

        const box = document.createElement('div');
        box.style.cssText = `
            background: #1e1e2e; border-radius: 16px; padding: 24px;
            width: 600px; max-width: 92vw; max-height: 80vh;
            overflow-y: auto; box-shadow: 0 24px 80px rgba(0,0,0,0.4);
            color: #cdd6f4; font-family: 'Segoe UI', system-ui, sans-serif;
        `;

        // 标题
        const header = document.createElement('div');
        header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
        header.innerHTML = `
            <h3 style="margin:0;font-size:16px;color:#cba6f7;">选择要修改的元素</h3>
            <button id="__picker-subpanel-close" style="background:none;border:none;color:#6c7086;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:6px;">✕</button>
        `;
        box.appendChild(header);

        // "选择整个容器" 按钮
        const containerBtn = document.createElement('div');
        const containerTag = containerEl.tagName.toLowerCase();
        const containerText = (containerEl.textContent || '').substring(0, 40).trim();
        containerBtn.style.cssText = `
            padding: 10px 14px; margin-bottom: 12px; background: #313244;
            border: 2px solid #6366f1; border-radius: 10px; cursor: pointer;
            transition: all 0.2s; display: flex; align-items: center; gap: 10px;
        `;
        containerBtn.innerHTML = `
            <span style="background:#6366f1;color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-family:monospace;">${containerTag}</span>
            <span style="font-size:13px;color:#a6adc8;">整个容器</span>
            <span style="font-size:12px;color:#6c7086;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px;">${containerText}</span>
        `;
        containerBtn.addEventListener('mouseenter', () => {
            containerBtn.style.background = '#45475a';
            highlightElement(containerEl);
        });
        containerBtn.addEventListener('mouseleave', () => {
            containerBtn.style.background = '#313244';
            overlayBox.style.display = 'none';
            labelBox.style.display = 'none';
        });
        containerBtn.addEventListener('click', () => {
            panel.remove();
            overlayBox.style.display = 'none';
            labelBox.style.display = 'none';
            selectAndOpenDialog(containerEl);
        });
        box.appendChild(containerBtn);

        // 分割线
        const divider = document.createElement('div');
        divider.style.cssText = 'height:1px;background:#45475a;margin:12px 0;';
        box.appendChild(divider);

        // 子元素标题
        const subTitle = document.createElement('div');
        subTitle.style.cssText = 'font-size:12px;color:#a6adc8;margin-bottom:10px;';
        subTitle.textContent = `子元素 (${containerEl.children.length} 个)`;
        box.appendChild(subTitle);

        // 列出所有子元素
        const children = Array.from(containerEl.children);
        children.forEach((child, i) => {
            if (isPickerElement(child)) return;

            const item = document.createElement('div');
            const tag = child.tagName.toLowerCase();
            const cls = child.className && typeof child.className === 'string'
                ? '.' + child.className.split(' ').filter(Boolean).slice(0, 2).join('.')
                : '';
            const text = (child.textContent || '').substring(0, 60).trim();
            const rect = child.getBoundingClientRect();
            const dims = `${Math.round(rect.width)}×${Math.round(rect.height)}`;

            item.style.cssText = `
                padding: 8px 14px; margin-bottom: 4px; background: #181825;
                border: 1px solid #313244; border-radius: 8px; cursor: pointer;
                transition: all 0.2s; display: flex; align-items: center; gap: 8px;
            `;
            item.innerHTML = `
                <span style="color:#6c7086;font-size:11px;min-width:20px;">${i + 1}</span>
                <span style="background:#45475a;color:#cdd6f4;padding:2px 6px;border-radius:3px;font-size:11px;font-family:monospace;">${tag}${cls}</span>
                <span style="font-size:12px;color:#a6adc8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${text || '(空)'}</span>
                <span style="font-size:11px;color:#585b70;">${dims}</span>
            `;

            item.addEventListener('mouseenter', () => {
                item.style.background = '#313244';
                item.style.borderColor = '#6366f1';
                highlightElement(child);
            });
            item.addEventListener('mouseleave', () => {
                item.style.background = '#181825';
                item.style.borderColor = '#313244';
                overlayBox.style.display = 'none';
                labelBox.style.display = 'none';
            });
            item.addEventListener('click', () => {
                panel.remove();
                overlayBox.style.display = 'none';
                labelBox.style.display = 'none';
                // 如果这个子元素还有子元素，继续展开
                if (child.children.length > 1) {
                    showSubElementPanel(child);
                } else {
                    selectAndOpenDialog(child);
                }
            });
            box.appendChild(item);
        });

        panel.appendChild(box);
        document.body.appendChild(panel);

        // 关闭事件
        document.getElementById('__picker-subpanel-close').addEventListener('click', () => {
            panel.remove();
            overlayBox.style.display = 'none';
            labelBox.style.display = 'none';
        });
        panel.addEventListener('click', (e) => {
            if (e.target === panel) {
                panel.remove();
                overlayBox.style.display = 'none';
                labelBox.style.display = 'none';
            }
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
            rect: el.getBoundingClientRect(),
            pageUrl: window.location.href,
            elementScreenshot: null // 由截图函数异步填充
        };
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
