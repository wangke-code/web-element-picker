import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import express from 'express';
import {
    createProxyMiddleware,
    responseInterceptor,
} from 'http-proxy-middleware';
import { WebSocketServer, WebSocket } from 'ws';

type ModifyCallback = (data: any) => void;

export class ProxyServer {
    private app: express.Application;
    private server: http.Server | undefined;
    private pickerWss: WebSocketServer | undefined;
    private port: number = 3200;
    private targetUrl: string;
    private injectDir: string;
    private modifyCallbacks: ModifyCallback[] = [];

    constructor(targetUrl: string, injectDir: string) {
        this.targetUrl = targetUrl.replace(/\/+$/, ''); // 去除末尾斜杠
        this.injectDir = path.resolve(injectDir); // 确保使用绝对路径
        this.app = express();
        this.setupRoutes();
    }

    onModifyRequest(cb: ModifyCallback) {
        this.modifyCallbacks.push(cb);
    }

    getTargetUrl(): string {
        return this.targetUrl;
    }

    private getInjectSnippet(): string {
        return `
<!-- Web Element Picker — Injected by Proxy -->
<link rel="stylesheet" href="/__picker__/dialog.css">
<script src="/__picker__/picker.js"><\/script>
<script src="/__picker__/dialog.js"><\/script>
<script>
  // Picker LiveReload WS
  (function(){
    var ws = new WebSocket('ws://' + location.host + '/__picker_ws__');
    ws.onmessage = function(e){ if(e.data==='reload') location.reload(); };
  })();
<\/script>
`;
    }

    private setupRoutes() {
        // 1. JSON body parser (只对 /api 路径)
        this.app.use('/api', express.json({ limit: '50mb' }));

        // 2. API: 接收修改请求
        this.app.post('/api/modify', (req, res) => {
            const data = req.body;
            this.modifyCallbacks.forEach(cb => cb(data));
            res.json({ success: true, message: '修改请求已发送到 Chat' });
        });

        // 3. 提供 picker 注入脚本 (静态文件)
        this.app.get('/__picker__/picker.js', (_req, res) => {
            res.type('application/javascript');
            res.sendFile(path.join(this.injectDir, 'picker.js'));
        });

        this.app.get('/__picker__/dialog.js', (_req, res) => {
            res.type('application/javascript');
            res.sendFile(path.join(this.injectDir, 'dialog.js'));
        });

        this.app.get('/__picker__/dialog.css', (_req, res) => {
            res.type('text/css');
            res.sendFile(path.join(this.injectDir, 'dialog.css'));
        });

        // 4. 反向代理到目标 URL
        const proxyMiddleware = createProxyMiddleware({
            target: this.targetUrl,
            changeOrigin: true,
            // WebSocket 代理 (用于 HMR 等)
            ws: true,
            selfHandleResponse: true,
            on: {
                proxyRes: responseInterceptor(
                    async (responseBuffer, proxyRes, req, res) => {
                        const contentType =
                            proxyRes.headers['content-type'] || '';

                        // 只对 HTML 响应注入脚本
                        if (contentType.includes('text/html')) {
                            let html = responseBuffer.toString('utf-8');
                            const snippet = this.getInjectSnippet();

                            if (html.includes('</head>')) {
                                // 优先在 </head> 前注入 CSS
                                html = html.replace(
                                    '</head>',
                                    `<link rel="stylesheet" href="/__picker__/dialog.css"></head>`
                                );
                            }

                            if (html.includes('</body>')) {
                                // 在 </body> 前注入脚本
                                html = html.replace(
                                    '</body>',
                                    `<script src="/__picker__/picker.js"><\/script>
<script src="/__picker__/dialog.js"><\/script>
<script>
(function(){
  var ws = new WebSocket('ws://'+location.host+'/__picker_ws__');
  ws.onmessage=function(e){if(e.data==='reload')location.reload();};
})();
<\/script>
</body>`
                                );
                            } else {
                                // 没有 </body>，直接追加
                                html += snippet;
                            }

                            return html;
                        }

                        // 非 HTML，原样返回
                        return responseBuffer;
                    }
                ),
            },
        });

        this.app.use('/', proxyMiddleware);
    }

    async start(): Promise<number> {
        const maxRetries = 20;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await this.tryListen(this.port + i);
            } catch (err: any) {
                if (err.code === 'EADDRINUSE') {
                    console.log(`Port ${this.port + i} in use, trying next...`);
                    continue;
                }
                throw err;
            }
        }
        throw new Error(`No available port found (tried ${this.port}–${this.port + maxRetries - 1})`);
    }

    private tryListen(port: number): Promise<number> {
        return new Promise((resolve, reject) => {
            const srv = this.app.listen(port, () => {
                this.port = port;
                this.server = srv;
                console.log(`Proxy server running at http://localhost:${port} → ${this.targetUrl}`);
                this.pickerWss = new WebSocketServer({
                    server: srv,
                    path: '/__picker_ws__',
                });
                resolve(port);
            });
            srv.on('error', (err: NodeJS.ErrnoException) => {
                reject(err);
            });
        });
    }

    stop() {
        if (this.pickerWss) {
            this.pickerWss.close();
            this.pickerWss = undefined;
        }
        if (this.server) {
            this.server.close();
            this.server = undefined;
        }
        console.log('Proxy server stopped');
    }
}
