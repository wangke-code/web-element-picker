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

// ========== 项目信息缓存 ==========
let cachedProjectHint: string | null = null;

async function getProjectHint(): Promise<string> {
    if (cachedProjectHint !== null) { return cachedProjectHint; }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) { cachedProjectHint = ''; return ''; }

    try {
        const pkgFiles = await vscode.workspace.findFiles('package.json', '**/node_modules/**', 1);
        if (!pkgFiles.length) { cachedProjectHint = ''; return ''; }

        const pkgContent = await vscode.workspace.fs.readFile(pkgFiles[0]);
        const pkg = JSON.parse(Buffer.from(pkgContent).toString('utf-8'));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        const parts: string[] = [];

        // 检测框架
        if (allDeps['next']) { parts.push(`Next.js ${allDeps['next'].replace('^', '')}`); }
        else if (allDeps['nuxt']) { parts.push('Nuxt'); }
        else if (allDeps['vue']) { parts.push('Vue'); }
        else if (allDeps['react']) { parts.push('React'); }
        else if (allDeps['svelte']) { parts.push('Svelte'); }
        else if (allDeps['@angular/core']) { parts.push('Angular'); }
        else if (allDeps['astro']) { parts.push('Astro'); }

        // 检测 UI 框架
        if (allDeps['tailwindcss']) { parts.push('Tailwind CSS'); }
        if (allDeps['antd']) { parts.push('Ant Design'); }
        if (allDeps['@mui/material']) { parts.push('MUI'); }
        if (allDeps['element-plus']) { parts.push('Element Plus'); }

        // 检测目录结构
        const dirChecks = [
            { pattern: 'src/app/**', label: 'src/app/' },
            { pattern: 'src/pages/**', label: 'src/pages/' },
            { pattern: 'src/components/**', label: 'src/components/' },
            { pattern: 'app/**', label: 'app/' },
            { pattern: 'components/**', label: 'components/' },
        ];
        const dirs: string[] = [];
        for (const check of dirChecks) {
            const found = await vscode.workspace.findFiles(check.pattern, '**/node_modules/**', 1);
            if (found.length) { dirs.push(check.label); }
        }
        if (dirs.length) { parts.push(`目录: ${dirs.join(', ')}`); }

        cachedProjectHint = parts.join(' + ');
    } catch {
        cachedProjectHint = '';
    }
    return cachedProjectHint;
}

// ========== 处理修改请求 ==========
async function handleModifyRequest(data: {
    selector: string;
    outerHTML: string;
    computedStyles: string;
    description: string;
    directText?: string;
    childSummary?: string;
    classNames?: string;
    ancestorChain?: string;
    frameworkInfo?: { framework: string | null; componentName: string | null } | null;
    identifiers?: Record<string, string> | null;
    referenceImage?: string;
    elementScreenshot?: string;
    pageUrl: string;
}) {
    const projectHint = await getProjectHint();

    // 构造 prompt — 按 AI 定位源文件的优先级排序
    let prompt = `## 修改要求\n${data.description}\n`;

    // 元素定位信息（最重要）
    prompt += `\n## 元素定位（用这些信息在源码中找到对应文件）\n`;

    if (data.frameworkInfo?.componentName) {
        prompt += `- **组件名**: ${data.frameworkInfo.componentName} (${data.frameworkInfo.framework})\n`;
    } else if (data.frameworkInfo?.framework) {
        prompt += `- **框架**: ${data.frameworkInfo.framework}\n`;
    }

    if (data.classNames) {
        prompt += `- **CSS 类名**: \`${data.classNames}\`\n`;
    }

    if (data.identifiers) {
        const idStr = Object.entries(data.identifiers).map(([k, v]) => `${k}="${v}"`).join(', ');
        prompt += `- **标识属性**: ${idStr}\n`;
    }

    if (data.directText) {
        prompt += `- **文本内容**: "${data.directText}"\n`;
    }

    prompt += `- **CSS 选择器**: \`${data.selector}\`\n`;
    prompt += `- **页面 URL**: ${data.pageUrl}\n`;

    // 项目信息
    if (projectHint) {
        prompt += `\n## 项目信息\n${projectHint}\n`;
    }

    // 结构上下文
    prompt += `\n## 结构上下文\n`;

    if (data.ancestorChain) {
        prompt += `**父级链**: ${data.ancestorChain}\n\n`;
    }

    prompt += `**HTML**:\n\`\`\`html\n${data.outerHTML}\n\`\`\`\n\n`;

    if (data.childSummary) {
        prompt += `**子元素**:\n\`\`\`\n${data.childSummary}\n\`\`\`\n\n`;
    }

    if (data.computedStyles) {
        prompt += `**当前计算样式**（仅供参考，请修改源码中的类名/样式）:\n\`\`\`css\n${data.computedStyles}\n\`\`\`\n\n`;
    }

    // 规则
    prompt += `## 规则\n`;
    prompt += `1. 用上面的组件名、类名或文本内容在源码中 grep 定位文件\n`;
    prompt += `2. 修改源码（JSX/Vue模板/CSS/Tailwind类名），不要用内联样式\n`;
    prompt += `3. 只改目标元素，不动父/兄弟/子元素（除非明确要求）\n`;

    if (data.referenceImage) {
        const fs = require('fs');
        const path = require('path');
        const tmpDir = require('os').tmpdir();
        const imgPath = path.join(tmpDir, `web-picker-ref-${Date.now()}.png`);
        const base64Data = data.referenceImage.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(imgPath, base64Data, 'base64');
        prompt += `\n[参考图片]: ${imgPath}\n`;
    }

    if (data.elementScreenshot) {
        const fs = require('fs');
        const path = require('path');
        const tmpDir = require('os').tmpdir();
        const shotPath = path.join(tmpDir, `web-picker-shot-${Date.now()}.png`);
        const base64Data = data.elementScreenshot.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(shotPath, base64Data, 'base64');
        prompt += `\n[元素截图]: ${shotPath}\n`;
    }

    // 发送到 Antigravity Agent Panel
    let sent = false;
    try {
        await vscode.commands.executeCommand('antigravity.sendPromptToAgentPanel', prompt);
        sent = true;
        vscode.window.showInformationMessage('✅ 修改请求已发送到 Antigravity Chat');
    } catch (e) {
        console.log('antigravity.sendPromptToAgentPanel failed:', e);
    }

    if (!sent) {
        await vscode.env.clipboard.writeText(prompt);
        try {
            await vscode.commands.executeCommand('antigravity.agentSidePanel.focus');
        } catch { /* ignore */ }
        vscode.window.showWarningMessage('修改请求已复制到剪贴板，请在 Antigravity Chat 中 Ctrl+V 粘贴');
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
