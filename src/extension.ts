import * as vscode from 'vscode';
import { ProxyServer } from './server';

let server: ProxyServer | undefined;

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
                handleModifyRequest(data);
            });

            try {
                const port = await server.start();
                const proxyUrl = `http://localhost:${port}`;
                vscode.window.showInformationMessage(
                    `🎯 Web Picker 代理已启动: ${proxyUrl} → ${targetUrl}`
                );

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

    context.subscriptions.push(startCmd, stopCmd, debugCmd);
}

// ========== 处理修改请求 ==========
async function handleModifyRequest(data: {
    selector: string;
    outerHTML: string;
    computedStyles: string;
    description: string;
    referenceImage?: string;
    elementScreenshot?: string;
    pageUrl: string;
}) {
    // 构造 prompt
    let prompt = `请修改以下前端元素：\n\n`;
    prompt += `**页面 URL**: ${data.pageUrl}\n`;
    prompt += `**CSS 选择器**: \`${data.selector}\`\n\n`;
    prompt += `**当前 HTML**:\n\`\`\`html\n${data.outerHTML}\n\`\`\`\n\n`;

    if (data.computedStyles) {
        prompt += `**关键样式**:\n\`\`\`css\n${data.computedStyles}\n\`\`\`\n\n`;
    }

    prompt += `**修改要求**: ${data.description}\n`;

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
    if (server) {
        server.stop();
    }
}
