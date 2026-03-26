// 独立启动脚本 — 不依赖 VS Code，直接启动预览服务器
const { PreviewServer } = require('./out/server');
const path = require('path');

const rootPath = path.join(__dirname, 'test-site');
const injectDir = path.join(__dirname, 'src', 'inject');

const server = new PreviewServer(rootPath, injectDir);

server.onModifyRequest((data) => {
    console.log('\n========== 收到修改请求 ==========');
    console.log('选择器:', data.selector);
    console.log('描述:', data.description);
    console.log('页面:', data.pageUrl);
    console.log('==================================\n');
});

server.start().then((port) => {
    console.log(`\n🎯 Web Element Picker 已启动！`);
    console.log(`👉 请访问: http://localhost:${port}`);
    console.log(`\n提示: 点击页面右下角 🎯 按钮进入选择模式\n`);

    // 自动打开浏览器
    const open = require('open');
    open(`http://localhost:${port}`);
}).catch(err => {
    console.error('启动失败:', err.message);
});
