/**
 * WebSocket RPC 示例
 *
 * 展示如何在浏览器和 Node.js 之间使用 WebSocket 传输 Cap'n Proto RPC
 */

import { RpcConnection, WebSocketTransport } from '@naeemo/capnp';
import { ChatService } from './chat.js'; // 生成的代码

// ===== 服务端 (Node.js) =====

class ChatServiceImpl implements ChatService.Server {
  private clients = new Map<string, ChatService.Client>();

  async join(params: { username: string }, context: { client: ChatService.Client }) {
    this.clients.set(params.username, context.client);

    // 广播用户加入
    for (const [name, client] of this.clients) {
      if (name !== params.username) {
        await client.onUserJoined({ username: params.username });
      }
    }

    return { roomId: 'general' };
  }

  async sendMessage(params: { text: string; username: string }) {
    // 广播消息给所有客户端
    for (const [_name, client] of this.clients) {
      await client.onMessage({
        username: params.username,
        text: params.text,
        timestamp: Date.now(),
      });
    }
  }
}

// 启动 WebSocket 服务器
async function startServer() {
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ port: 8080 });

  wss.on('connection', (ws) => {
    const transport = new WebSocketTransport(ws);
    const connection = new RpcConnection(transport, {
      bootstrap: new ChatServiceImpl(),
    });
    connection.start();
  });

  console.log('WebSocket server on ws://localhost:8080');
}

// ===== 客户端 (浏览器) =====

async function startClient() {
  const ws = new WebSocket('ws://localhost:8080');

  await new Promise((resolve) => {
    ws.onopen = resolve;
  });

  const transport = new WebSocketTransport(ws);
  const connection = new RpcConnection(transport);
  await connection.start();

  // 实现客户端回调
  const clientImpl: ChatService.Client = {
    async onMessage(params) {
      console.log(`[${params.username}]: ${params.text}`);
    },
    async onUserJoined(params) {
      console.log(`${params.username} joined the room`);
    },
  };

  // 获取服务并加入聊天室
  const chat = await connection.bootstrap().getAs(ChatService);
  await chat.join({ username: 'Alice' }, { client: clientImpl });

  // 发送消息
  await chat.sendMessage({
    username: 'Alice',
    text: 'Hello everyone!',
  });
}

// 运行
if (typeof window === 'undefined') {
  startServer();
} else {
  startClient();
}
