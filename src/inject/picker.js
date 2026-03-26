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

        // 普通点击：选中并打开对话框
        const info = getElementInfo(target);

        // 退出选择模式
        togglePicker();

        // 自动截取元素截图
        captureElementScreenshot(target).then((screenshot) => {
            info.elementScreenshot = screenshot;
            // 打开修改对话框
            if (window.__webPickerDialog) {
                window.__webPickerDialog.open(info);
            }
        });
    }, true);

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
            outerHTML: el.outerHTML.substring(0, 3000),
            computedStyles: getKeyStyles(el),
            tagName: el.tagName.toLowerCase(),
            textContent: (el.textContent || '').substring(0, 300),
            rect: el.getBoundingClientRect(),
            pageUrl: window.location.href,
            elementScreenshot: null // 由截图函数异步填充
        };
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
