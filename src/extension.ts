import * as vscode from 'vscode';
import { ProxyServer } from './server';

let server: ProxyServer | undefined;
let fileWatcher: vscode.FileSystemWatcher | undefined;
let pendingModify = false; // 只在发送修改请求后才监听文件变更

export function activate(context: vscode.ExtensionContext) {
    console.log('Web Element Picker extension activated');

    // ========== 启动代理 ==========
    const startCmd = vscode.commands.registerCommand(
        'webPicker.startProxy',
        async () => {
            // 让用户输入目标 URL
            const targetUrl = await vscode.window.showInputBox({
                prompt: '输入目标 Web 服务的 URL',
                placeHolder: 'http://localhost:3000',
                value: 'http://localhost:3000',
                validateInput: (value) => {
                    try {
                        new URL(value);
                        return null;
                    } catch {
                        return '请输入有效的 URL，例如 http://localhost:3000';
                    }
                },
            });

            if (!targetUrl) {
                return; // 用户取消
            }

            // 如果已有服务在运行，先停止
            if (server) {
                server.stop();
            }

            const injectDir = context.asAbsolutePath('src/inject');
            server = new ProxyServer(targetUrl, injectDir);

            // 监听修改请求
            server.onModifyRequest((data) => {
                pendingModify = true;
                handleModifyRequest(data);
            });

            // 监听撤销请求（从浏览器按钮）
            server.onUndoRequest(() => {
                handleUndoRequest();
            });

            try {
                const port = await server.start();
                const proxyUrl = `http://localhost:${port}`;
                vscode.window.showInformationMessage(
                    `🎯 Web Picker 代理已启动: ${proxyUrl} → ${targetUrl}`
                );

                // 监听工作区文件变更，只在 pendingModify 时触发刷新
                if (fileWatcher) {
                    fileWatcher.dispose();
                }
                fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
                let debounceTimer: NodeJS.Timeout | undefined;
                const onFileChange = () => {
                    if (!pendingModify || !server) { return; }
                    // 防抖：AI 可能连续改多个文件，等 2 秒稳定后再刷新
                    if (debounceTimer) { clearTimeout(debounceTimer); }
                    debounceTimer = setTimeout(() => {
                        pendingModify = false;
                        server?.broadcastReload();
                    }, 2000);
                };
                fileWatcher.onDidChange(onFileChange);
                fileWatcher.onDidCreate(onFileChange);
                context.subscriptions.push(fileWatcher);

                // 自动打开浏览器
                try {
                    const open = require('open');
                    await open(proxyUrl, {
                        app: {
                            name:
                                process.platform === 'darwin'
                                    ? 'google chrome'
                                    : 'chrome',
                        },
                    });
                } catch {
                    await vscode.env.openExternal(
                        vscode.Uri.parse(proxyUrl)
                    );
                }
            } catch (err: any) {
                vscode.window.showErrorMessage(
                    `启动失败: ${err.message}`
                );
            }
        }
    );

    // ========== 停止代理 ==========
    const stopCmd = vscode.commands.registerCommand(
        'webPicker.stopProxy',
        () => {
            if (server) {
                server.stop();
                server = undefined;
                vscode.window.showInformationMessage(
                    'Web Picker 代理已停止'
                );
            }
        }
    );

    // ========== 诊断：列出所有 chat 相关命令 ==========
    const debugCmd = vscode.commands.registerCommand(
        'webPicker.debugChat',
        async () => {
            const allCmds = await vscode.commands.getCommands(true);
            const chatCmds = allCmds.filter(
                (c) =>
                    c.toLowerCase().includes('chat') ||
                    c.toLowerCase().includes('antigravity') ||
                    c.toLowerCase().includes('gemini') ||
                    c.toLowerCase().includes('copilot') ||
                    c.toLowerCase().includes('augment')
            );
            chatCmds.sort();

            // 输出到 Output Channel
            const channel = vscode.window.createOutputChannel('Web Picker Debug');
            channel.show();
            channel.appendLine('=== Chat-related commands ===');
            chatCmds.forEach((c) => channel.appendLine(c));
            channel.appendLine(`\nTotal: ${chatCmds.length} commands`);

            vscode.window.showInformationMessage(
                `找到 ${chatCmds.length} 个 chat 相关命令，请查看 Output 面板`
            );
        }
    );

    // ========== 撤销上一次修改 ==========
    const undoCmd = vscode.commands.registerCommand(
        'webPicker.undo',
        async () => {
            const prompt = '请撤销你上一次对前端元素的修改，恢复到修改前的状态。';
            let sent = false;
            try {
                await vscode.commands.executeCommand(
                    'antigravity.sendPromptToAgentPanel',
                    prompt
                );
                sent = true;
                vscode.window.showInformationMessage('✅ 撤销请求已发送');
            } catch (e) {
                console.log('undo sendPromptToAgentPanel failed:', e);
            }
            if (!sent) {
                await vscode.env.clipboard.writeText(prompt);
                try {
                    await vscode.commands.executeCommand('antigravity.agentSidePanel.focus');
                } catch { /* ignore */ }
                vscode.window.showWarningMessage('撤销请求已复制到剪贴板，请在 Chat 中粘贴');
            }
        }
    );

    context.subscriptions.push(startCmd, stopCmd, undoCmd, debugCmd);
}

// ========== 处理撤销请求 ==========
async function handleUndoRequest() {
    const prompt = '请撤销你上一次对前端元素的修改，恢复到修改前的状态。';
    try {
        await vscode.commands.executeCommand(
            'antigravity.sendPromptToAgentPanel',
            prompt
        );
        vscode.window.showInformationMessage('✅ 撤销请求已发送');
    } catch (e) {
        await vscode.env.clipboard.writeText(prompt);
        try {
            await vscode.commands.executeCommand('antigravity.agentSidePanel.focus');
        } catch { /* ignore */ }
        vscode.window.showWarningMessage('撤销请求已复制到剪贴板，请在 Chat 中粘贴');
    }
}

// ========== 处理修改请求 ==========
async function handleModifyRequest(data: {
    selector: string;
    outerHTML: string;
    computedStyles: string;
    description: string;
    directText?: string;
    childSummary?: string;
    referenceImage?: string;
    elementScreenshot?: string;
    pageUrl: string;
}) {
    // 构造 prompt
    let prompt = `请修改以下前端元素。\n\n`;
    prompt += `## 目标定位\n`;
    prompt += `- **页面 URL**: ${data.pageUrl}\n`;
    prompt += `- **CSS 选择器**: \`${data.selector}\`\n`;

    if (data.directText) {
        prompt += `- **元素文本内容**: "${data.directText}"\n`;
    }

    prompt += `\n## 元素当前状态\n`;
    prompt += `**HTML 结构**:\n\`\`\`html\n${data.outerHTML}\n\`\`\`\n\n`;

    if (data.computedStyles) {
        prompt += `**计算样式**:\n\`\`\`css\n${data.computedStyles}\n\`\`\`\n\n`;
    }

    prompt += `## 修改要求\n${data.description}\n`;
    prompt += `\n## 重要规则\n`;
    prompt += `1. 只修改上述 CSS 选择器精确匹配的那个元素\n`;
    prompt += `2. 不要修改其父元素或兄弟元素\n`;
    prompt += `3. 除非修改要求明确提到子元素，否则不要改动子元素\n`;
    prompt += `4. 在源代码文件中找到对应的组件/模板进行修改，不要用内联样式覆盖\n`;

    if (data.referenceImage) {
        prompt += `\n[用户提供了参考图片]\n`;
        const fs = require('fs');
        const path = require('path');
        const tmpDir = require('os').tmpdir();
        const imgPath = path.join(tmpDir, `web-picker-ref-${Date.now()}.png`);
        const base64Data = data.referenceImage.replace(
            /^data:image\/\w+;base64,/,
            ''
        );
        fs.writeFileSync(imgPath, base64Data, 'base64');
        prompt += `参考图片已保存到: ${imgPath}\n`;
    }

    if (data.elementScreenshot) {
        const fs = require('fs');
        const path = require('path');
        const tmpDir = require('os').tmpdir();
        const shotPath = path.join(
            tmpDir,
            `web-picker-shot-${Date.now()}.png`
        );
        const base64Data = data.elementScreenshot.replace(
            /^data:image\/\w+;base64,/,
            ''
        );
        fs.writeFileSync(shotPath, base64Data, 'base64');
        prompt += `\n元素截图已保存到: ${shotPath}\n`;
    }

    // 发送到 Antigravity Agent Panel
    let sent = false;

    // 方式1: 直接发送到 Antigravity Agent Panel
    try {
        await vscode.commands.executeCommand(
            'antigravity.sendPromptToAgentPanel',
            prompt
        );
        sent = true;
        vscode.window.showInformationMessage(
            '✅ 修改请求已发送到 Antigravity Chat'
        );
    } catch (e) {
        console.log('antigravity.sendPromptToAgentPanel failed:', e);
    }

    // 方式2: fallback — 复制到剪贴板 + 聚焦面板
    if (!sent) {
        await vscode.env.clipboard.writeText(prompt);
        try {
            await vscode.commands.executeCommand('antigravity.agentSidePanel.focus');
        } catch {
            // ignore
        }
        vscode.window.showWarningMessage(
            '修改请求已复制到剪贴板，请在 Antigravity Chat 中 Ctrl+V 粘贴'
        );
    }
}

export function deactivate() {
    if (fileWatcher) {
        fileWatcher.dispose();
    }
    if (server) {
        server.stop();
    }
}
