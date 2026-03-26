/**
 * Web Element Picker - 修改对话框
 * 选中元素后弹出此对话框，用户输入修改描述和参考图片
 * 支持：快捷标签、图片上传、拖拽、截图预览
 */
(function () {
    'use strict';

    window.__webPickerDialog = {
        open: openDialog
    };

    let dialogContainer = null;
    let currentElementInfo = null;

    // 快捷标签（常见修改类型）
    const quickTags = [
        { label: '🎨 改颜色', text: '修改颜色为' },
        { label: '📐 改尺寸', text: '修改宽高尺寸为' },
        { label: '✏️ 改文字', text: '修改文字内容为' },
        { label: '📦 改布局', text: '修改布局方式为' },
        { label: '🔤 改字体', text: '修改字体为' },
        { label: '🔲 改边框', text: '修改边框样式为' },
        { label: '📱 响应式', text: '让此元素在移动端自适应' },
        { label: '✨ 加动画', text: '添加动画效果：' },
    ];

    function openDialog(elementInfo) {
        currentElementInfo = elementInfo;

        // 移除旧对话框
        if (dialogContainer) {
            dialogContainer.remove();
        }

        // 创建遮罩 + 对话框
        dialogContainer = document.createElement('div');
        dialogContainer.id = '__dialog-container';
        dialogContainer.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 2147483645;
            display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px);
            animation: __dialogFadeIn 0.25s ease;
        `;

        const dialog = document.createElement('div');
        dialog.id = '__dialog-box';
        dialog.style.cssText = `
            background: #1e1e2e;
            border-radius: 16px;
            padding: 28px;
            width: 560px;
            max-width: 92vw;
            max-height: 88vh;
            overflow-y: auto;
            box-shadow: 0 24px 80px rgba(0,0,0,0.4);
            color: #cdd6f4;
            font-family: 'Segoe UI', system-ui, sans-serif;
            animation: __dialogSlideUp 0.3s cubic-bezier(0.4,0,0.2,1);
        `;

        // 元素预览
        const tagLabel = elementInfo.tagName || 'element';
        const selectorLabel = elementInfo.selector || '';
        const textPreview = (elementInfo.textContent || '').substring(0, 100);

        // 快捷标签 HTML
        const quickTagsHtml = quickTags.map((t, i) =>
            `<button class="__dialog-quick-tag" data-index="${i}" style="
                padding:5px 12px; border:1px solid #45475a; background:#313244;
                color:#cdd6f4; border-radius:20px; cursor:pointer; font-size:12px;
                transition:all 0.2s; white-space:nowrap; font-family:'Segoe UI',sans-serif;
            ">${t.label}</button>`
        ).join('');

        dialog.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">
                <h3 style="margin:0; font-size:18px; color:#cba6f7; font-weight:600;">
                    ✏️ 修改元素
                </h3>
                <button id="__dialog-close" style="
                    background:none; border:none; color:#6c7086; font-size:22px;
                    cursor:pointer; padding:4px 8px; border-radius:6px;
                    transition: all 0.2s;
                " onmouseenter="this.style.background='#313244';this.style.color='#cdd6f4'"
                   onmouseleave="this.style.background='none';this.style.color='#6c7086'"
                >✕</button>
            </div>

            <!-- 选中元素预览 -->
            <div style="
                background: #313244; border-radius:10px; padding:14px;
                margin-bottom:16px; border-left: 3px solid #6366f1;
            ">
                <div style="font-size:12px; color:#a6adc8; margin-bottom:6px;">选中的元素</div>
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="
                        background:#6366f1; color:white; padding:2px 8px;
                        border-radius:4px; font-size:12px; font-family:monospace;
                    ">${tagLabel}</span>
                    <span style="color:#89b4fa; font-size:12px; font-family:monospace; word-break:break-all;">${selectorLabel}</span>
                </div>
                ${textPreview ? `<div style="color:#a6adc8; font-size:12px; margin-top:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">"${textPreview}"</div>` : ''}
            </div>

            <!-- 快捷标签 -->
            <div style="margin-bottom:16px;">
                <div style="font-size:12px; color:#a6adc8; margin-bottom:8px;">快捷填充</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${quickTagsHtml}
                </div>
            </div>

            <!-- 修改描述 -->
            <div style="margin-bottom:16px;">
                <label style="display:block; font-size:13px; color:#a6adc8; margin-bottom:8px; font-weight:500;">
                    修改描述 <span style="color:#f38ba8;">*</span>
                </label>
                <textarea id="__dialog-description" placeholder="描述你想要的修改，例如：把这个按钮改成圆角红色渐变背景，文字改为白色..." style="
                    width:100%; height:110px; padding:12px;
                    background:#181825; border:1px solid #45475a;
                    border-radius:10px; color:#cdd6f4; font-size:14px;
                    font-family:'Segoe UI', sans-serif; resize:vertical;
                    outline:none; transition: border-color 0.2s;
                    box-sizing:border-box; line-height:1.5;
                " onfocus="this.style.borderColor='#6366f1'"
                   onblur="this.style.borderColor='#45475a'"
                ></textarea>
            </div>

            <!-- 参考图片 -->
            <div style="margin-bottom:24px;">
                <label style="display:block; font-size:13px; color:#a6adc8; margin-bottom:8px; font-weight:500;">
                    参考图片（可选）
                </label>
                <div id="__dialog-dropzone" style="
                    width:100%; min-height:72px; padding:16px;
                    background:#181825; border:2px dashed #45475a;
                    border-radius:10px; text-align:center;
                    cursor:pointer; transition: all 0.2s;
                    box-sizing:border-box;
                    display:flex; flex-direction:column;
                    align-items:center; justify-content:center; gap:6px;
                ">
                    <div style="font-size:24px;">📎</div>
                    <div style="color:#6c7086; font-size:12px;">拖拽图片到此处，或点击上传</div>
                    <input type="file" id="__dialog-file" accept="image/*" style="display:none;">
                </div>
                <div id="__dialog-preview" style="display:none; margin-top:10px; position:relative;">
                    <img id="__dialog-preview-img" style="
                        max-width:100%; max-height:200px; border-radius:8px;
                        border:1px solid #45475a;
                    ">
                    <button id="__dialog-remove-img" style="
                        position:absolute; top:6px; right:6px;
                        background:rgba(0,0,0,0.6); border:none; color:white;
                        width:24px; height:24px; border-radius:50%;
                        cursor:pointer; font-size:14px; display:flex;
                        align-items:center; justify-content:center;
                    ">✕</button>
                </div>
            </div>

            <!-- 按钮 -->
            <div style="display:flex; gap:10px; justify-content:flex-end;">
                <button id="__dialog-cancel" style="
                    padding:10px 22px; border:1px solid #45475a; background:transparent;
                    color:#cdd6f4; border-radius:10px; cursor:pointer; font-size:14px;
                    transition:all 0.2s; font-family:'Segoe UI', sans-serif;
                " onmouseenter="this.style.background='#313244'"
                   onmouseleave="this.style.background='transparent'"
                >取消</button>
                <button id="__dialog-confirm" style="
                    padding:10px 22px; border:none;
                    background:linear-gradient(135deg, #6366f1, #8b5cf6);
                    color:white; border-radius:10px; cursor:pointer; font-size:14px;
                    font-weight:600; transition:all 0.2s; font-family:'Segoe UI', sans-serif;
                    box-shadow: 0 2px 12px rgba(99,102,241,0.3);
                " onmouseenter="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 20px rgba(99,102,241,0.5)'"
                   onmouseleave="this.style.transform='translateY(0)';this.style.boxShadow='0 2px 12px rgba(99,102,241,0.3)'"
                >发送到 Chat →</button>
            </div>
        `;

        dialogContainer.appendChild(dialog);
        document.body.appendChild(dialogContainer);

        // ========== 绑定事件 ==========
        let imageBase64 = null;

        // 关闭
        document.getElementById('__dialog-close').addEventListener('click', closeDialog);
        document.getElementById('__dialog-cancel').addEventListener('click', closeDialog);

        // 点击遮罩关闭
        dialogContainer.addEventListener('click', (e) => {
            if (e.target === dialogContainer) closeDialog();
        });

        // ESC 关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeDialog();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        // 快捷标签点击
        dialog.querySelectorAll('.__dialog-quick-tag').forEach((btn) => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.getAttribute('data-index'));
                const tag = quickTags[index];
                const textarea = document.getElementById('__dialog-description');
                const current = textarea.value;
                textarea.value = current ? current + '\n' + tag.text : tag.text;
                textarea.focus();
                // 高亮选中的标签
                btn.style.background = '#6366f1';
                btn.style.borderColor = '#6366f1';
                btn.style.color = 'white';
            });
            btn.addEventListener('mouseenter', () => {
                if (btn.style.background !== '#6366f1') {
                    btn.style.background = '#45475a';
                }
            });
            btn.addEventListener('mouseleave', () => {
                if (btn.style.borderColor !== '#6366f1') {
                    btn.style.background = '#313244';
                }
            });
        });

        // 文件上传
        const dropzone = document.getElementById('__dialog-dropzone');
        const fileInput = document.getElementById('__dialog-file');
        const preview = document.getElementById('__dialog-preview');
        const previewImg = document.getElementById('__dialog-preview-img');
        const removeImg = document.getElementById('__dialog-remove-img');

        dropzone.addEventListener('click', () => fileInput.click());

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#6366f1';
            dropzone.style.background = '#1e1e2e';
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.style.borderColor = '#45475a';
            dropzone.style.background = '#181825';
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.style.borderColor = '#45475a';
            dropzone.style.background = '#181825';
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                handleImageFile(file);
            }
        });

        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (file) handleImageFile(file);
        });

        removeImg.addEventListener('click', () => {
            imageBase64 = null;
            preview.style.display = 'none';
            dropzone.style.display = 'flex';
        });

        function handleImageFile(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imageBase64 = e.target.result;
                previewImg.src = imageBase64;
                preview.style.display = 'block';
                dropzone.style.display = 'none';
            };
            reader.readAsDataURL(file);
        }

        // Ctrl+Enter 快速发送
        document.getElementById('__dialog-description').addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('__dialog-confirm').click();
            }
        });

        // 确认发送
        document.getElementById('__dialog-confirm').addEventListener('click', async () => {
            const description = document.getElementById('__dialog-description').value.trim();
            if (!description) {
                const ta = document.getElementById('__dialog-description');
                ta.style.borderColor = '#f38ba8';
                ta.focus();
                // shake animation
                ta.style.animation = 'none';
                ta.offsetHeight; // trigger reflow
                ta.style.animation = '__dialogShake 0.3s ease';
                return;
            }

            const payload = {
                selector: currentElementInfo.selector,
                outerHTML: currentElementInfo.outerHTML,
                computedStyles: currentElementInfo.computedStyles,
                description: description,
                directText: currentElementInfo.directText || '',
                childSummary: currentElementInfo.childSummary || '',
                referenceImage: imageBase64,
                elementScreenshot: currentElementInfo.elementScreenshot || null,
                pageUrl: currentElementInfo.pageUrl
            };

            // 发送到代理服务器
            const btn = document.getElementById('__dialog-confirm');
            btn.textContent = '发送中...';
            btn.style.opacity = '0.7';
            btn.disabled = true;

            try {
                const resp = await fetch('/api/modify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await resp.json();
                if (result.success) {
                    closeDialog();
                    showWaitingToast();
                    // 显示撤销按钮
                    if (window.__webPickerShowUndo) {
                        window.__webPickerShowUndo();
                    }
                } else {
                    showToast('❌ 发送失败，请重试');
                    resetBtn(btn);
                }
            } catch (err) {
                showToast('❌ 连接失败，请检查代理服务');
                resetBtn(btn);
            }
        });

        function resetBtn(btn) {
            btn.textContent = '发送到 Chat →';
            btn.style.opacity = '1';
            btn.disabled = false;
        }

        // 聚焦描述输入框
        setTimeout(() => {
            document.getElementById('__dialog-description').focus();
        }, 300);
    }

    function closeDialog() {
        if (dialogContainer) {
            dialogContainer.style.animation = '__dialogFadeOut 0.2s ease';
            setTimeout(() => {
                if (dialogContainer) {
                    dialogContainer.remove();
                    dialogContainer = null;
                }
            }, 200);
        }
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 90px; right: 24px;
            background: #1e1e2e; color: #cdd6f4;
            padding: 12px 20px; border-radius: 10px;
            font-size: 14px; font-family: 'Segoe UI', sans-serif;
            z-index: 2147483646;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            border: 1px solid #45475a;
            animation: __dialogSlideUp 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function showWaitingToast() {
        const toast = document.createElement('div');
        toast.id = '__picker-waiting-toast';
        toast.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: white; padding: 14px 28px; border-radius: 12px;
            font-size: 14px; font-family: 'Segoe UI', system-ui, sans-serif;
            z-index: 2147483647;
            box-shadow: 0 4px 24px rgba(99,102,241,0.4);
            animation: __dialogSlideUp 0.3s ease;
            display: flex; align-items: center; gap: 10px;
        `;
        toast.innerHTML = '<span style="display:inline-block;animation:__pickerSpin 1s linear infinite;">⏳</span> 已发送到 AI Chat，等待修改完成...';
        document.body.appendChild(toast);

        // 添加旋转动画
        if (!document.getElementById('__picker-spin-style')) {
            const style = document.createElement('style');
            style.id = '__picker-spin-style';
            style.textContent = '@keyframes __pickerSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
            document.head.appendChild(style);
        }
    }
})();
