# Web Element Picker

可视化选择网页元素，一键发送修改请求到 AI Chat。

适用于任何 Web 项目，支持 Antigravity IDE。

## 功能

- **反向代理** — 代理任意本地 Web 服务，自动注入选择器脚本
- **元素选择** — 悬停高亮、点击选中、Shift+Click 选父元素
- **子元素面板** — 点击容器自动展开子元素列表，精确选择目标
- **修改对话框** — 快捷标签、修改描述、参考图片上传
- **AI 集成** — 自动将结构化 prompt 发送到 Antigravity Chat
- **智能刷新** — 拦截 HMR，仅在 AI 修改完成后刷新页面
- **撤销** — 浏览器内一键撤销上次修改

## 安装

```
Ctrl+Shift+P → Extensions: Install from VSIX → 选择 web-element-picker-0.2.0.vsix
```

## 使用

1. 启动你的 Web 项目（如 `npm run dev`）
2. `Ctrl+Shift+P` → `Web Picker: Start Proxy`
3. 输入目标 URL（如 `http://localhost:3000`）
4. 浏览器自动打开代理页面
5. 点击右下角 🎯 进入选择模式
6. 悬停高亮 → 点击选中 → 填写修改描述 → 发送到 AI Chat
7. AI 修改完成后页面自动刷新，不满意点 ↩ 撤销

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt+P` | 切换选择模式 |
| `Shift+Click` | 选择父元素 |
| `ESC` | 退出选择模式 |
| `Ctrl+Enter` | 快速发送修改请求 |

## 命令

| 命令 | 说明 |
|------|------|
| `Web Picker: Start Proxy` | 启动代理服务 |
| `Web Picker: Stop Proxy` | 停止代理服务 |
| `Web Picker: Undo Last Modification` | 撤销上次修改 |
| `Web Picker: Debug Chat Commands` | 列出可用的 Chat 命令 |

## 工作原理

```
浏览器 ←→ 代理服务器(3200) ←→ 目标应用(3000)
              ↓ 注入 picker.js + dialog.js
              ↓ 拦截 HMR WebSocket
              ↓ WebSocket 通知刷新
              ↓
         VS Code 扩展
              ↓ 构造结构化 prompt
              ↓ 文件变更监听
              ↓
        Antigravity Chat → AI 修改代码
```

## 技术栈

- TypeScript + Express + http-proxy-middleware
- WebSocket（ws）用于浏览器通信
- VS Code Extension API

## License

MIT
