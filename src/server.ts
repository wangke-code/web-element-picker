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
    private undoCallbacks: (() => void)[] = [];

    constructor(targetUrl: string, injectDir: string) {
        this.targetUrl = targetUrl.replace(/\/+$/, ''); // 去除末尾斜杠
        this.injectDir = path.resolve(injectDir); // 确保使用绝对路径
        this.app = express();
        this.setupRoutes();
    }

    onModifyRequest(cb: ModifyCallback) {
        this.modifyCallbacks.push(cb);
    }

    onUndoRequest(cb: () => void) {
        this.undoCallbacks.push(cb);
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
(function(){
  var ws = new WebSocket('ws://'+location.host+'/__picker_ws__');
  ws.onmessage = function(e){
    var data = e.data;
    if(data === 'reload'){
      // 显示刷新提示
      var toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#10b981;color:white;padding:12px 24px;border-radius:10px;font-size:14px;font-family:system-ui,sans-serif;z-index:2147483647;box-shadow:0 4px 20px rgba(16,185,129,0.4);animation:__dialogSlideUp 0.3s ease;';
      toast.textContent = '✅ 检测到代码变更，正在刷新...';
      document.body.appendChild(toast);
      setTimeout(function(){ location.reload(); }, 800);
    }
  };
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

        // 2.5 API: 撤销上一次修改
        this.app.post('/api/undo', (_req, res) => {
            this.undoCallbacks.forEach(cb => cb());
            res.json({ success: true, message: '撤销请求已发送' });
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
            // 不代理 HMR WebSocket，避免随机刷新
            ws: false,
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

                            // 在 <head> 最前面注入 HMR 拦截脚本（必须在其他脚本之前）
                            if (html.includes('<head>')) {
                                html = html.replace(
                                    '<head>',
                                    `<head>
<script>
// === 拦截 HMR WebSocket，阻止目标应用自动刷新 ===
(function(){
  var OrigWS = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    var urlStr = (typeof url === 'string') ? url : url.toString();
    if (urlStr.indexOf('__picker_ws__') !== -1) {
      return protocols ? new OrigWS(url, protocols) : new OrigWS(url);
    }
    if (urlStr.indexOf('_next') !== -1 || urlStr.indexOf('webpack') !== -1 ||
        urlStr.indexOf('hmr') !== -1 || urlStr.indexOf('vite') !== -1 ||
        urlStr.indexOf('hot-update') !== -1 || urlStr.indexOf('turbopack') !== -1) {
      console.log('[WebPicker] Blocked HMR WebSocket:', urlStr);
      return { readyState: 3, send:function(){}, close:function(){},
        addEventListener:function(){}, removeEventListener:function(){},
        onopen:null, onclose:null, onmessage:null, onerror:null,
        CONNECTING:0, OPEN:1, CLOSING:2, CLOSED:3 };
    }
    return protocols ? new OrigWS(url, protocols) : new OrigWS(url);
  };
  window.WebSocket.prototype = OrigWS.prototype;
  window.WebSocket.CONNECTING=0; window.WebSocket.OPEN=1;
  window.WebSocket.CLOSING=2; window.WebSocket.CLOSED=3;
  window.WebSocket.__original = OrigWS;
})();
<\/script>`
                                );
                            }

                            if (html.includes('</head>')) {
                                // 在 </head> 前注入 CSS
                                html = html.replace(
                                    '</head>',
                                    `<link rel="stylesheet" href="/__picker__/dialog.css"></head>`
                                );
                            }

                            if (html.includes('</body>')) {
                                // 在 </body> 前注入 picker 脚本
                                html = html.replace(
                                    '</body>',
                                    `<script src="/__picker__/picker.js"><\/script>
<script src="/__picker__/dialog.js"><\/script>
<script>
(function(){
  var OrigWS = window.WebSocket.__original || window.WebSocket;
  var ws;
  try { ws = new OrigWS('ws://'+location.host+'/__picker_ws__'); } catch(e){ return; }
  ws.onmessage = function(e){
    if(e.data === 'reload'){
      var waiting = document.getElementById('__picker-waiting-toast');
      if(waiting) waiting.remove();
      var toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#10b981;color:white;padding:12px 24px;border-radius:10px;font-size:14px;font-family:system-ui,sans-serif;z-index:2147483647;box-shadow:0 4px 20px rgba(16,185,129,0.4);';
      toast.textContent = '✅ 修改完成，正在刷新...';
      document.body.appendChild(toast);
      setTimeout(function(){ location.reload(); }, 800);
    }
  };
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

    // 向所有浏览器客户端广播消息
    broadcastReload() {
        if (this.pickerWss) {
            this.pickerWss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send('reload');
                }
            });
        }
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
