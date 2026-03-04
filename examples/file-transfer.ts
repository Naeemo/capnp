/**
 * 文件传输示例
 * 
 * 展示如何使用 Cap'n Proto 进行大文件分块传输
 */

import { MessageBuilder, MessageReader } from '@naeemo/capnp';
import { FileChunk, FileTransfer } from './file-transfer.js'; // 生成的代码
import * as fs from 'fs';

const CHUNK_SIZE = 64 * 1024; // 64KB 每块

/**
 * 读取文件并分块传输
 */
async function* readFileChunks(filePath: string): AsyncGenerator<Uint8Array> {
  const stream = fs.createReadStream(filePath, { 
    highWaterMark: CHUNK_SIZE 
  });
  
  for await (const chunk of stream) {
    yield chunk;
  }
}

/**
 * 发送文件
 */
async function sendFile(
  filePath: string, 
  sendChunk: (chunk: Uint8Array, index: number, isLast: boolean) => Promise<void>
) {
  const stat = fs.statSync(filePath);
  const totalChunks = Math.ceil(stat.size / CHUNK_SIZE);
  
  let index = 0;
  for await (const data of readFileChunks(filePath)) {
    const isLast = index === totalChunks - 1;
    await sendChunk(data, index, isLast);
    index++;
    
    // 显示进度
    const progress = ((index / totalChunks) * 100).toFixed(1);
    console.log(`Progress: ${progress}%`);
  }
}

/**
 * 构建文件块消息
 */
function createFileChunk(
  fileId: string,
  chunkIndex: number,
  totalChunks: number,
  data: Uint8Array,
  isLast: boolean
): ArrayBuffer {
  const message = new MessageBuilder();
  const chunk = message.initRoot(FileChunk);
  
  chunk.setFileId(fileId);
  chunk.setChunkIndex(chunkIndex);
  chunk.setTotalChunks(totalChunks);
  chunk.setData(data);
  chunk.setIsLast(isLast);
  
  return message.toArrayBuffer();
}

/**
 * 接收并重组文件
 */
class FileReceiver {
  private chunks = new Map<number, Uint8Array>();
  private receivedChunks = 0;
  
  constructor(
    private fileId: string,
    private totalChunks: number,
    private outputPath: string
  ) {}

  async receiveChunk(chunkData: ArrayBuffer): Promise<boolean> {
    const reader = new MessageReader(new Uint8Array(chunkData));
    const chunk = reader.getRoot(FileChunk);
    
    if (chunk.getFileId() !== this.fileId) {
      throw new Error('File ID mismatch');
    }
    
    const index = chunk.getChunkIndex();
    this.chunks.set(index, chunk.getData());
    this.receivedChunks++;
    
    // 检查是否完成
    if (chunk.getIsLast() || this.receivedChunks === this.totalChunks) {
      await this.saveFile();
      return true;
    }
    
    return false;
  }

  private async saveFile() {
    const writeStream = fs.createWriteStream(this.outputPath);
    
    // 按顺序写入
    for (let i = 0; i < this.totalChunks; i++) {
      const chunk = this.chunks.get(i);
      if (!chunk) {
        throw new Error(`Missing chunk ${i}`);
      }
      writeStream.write(chunk);
    }
    
    writeStream.end();
    console.log(`File saved to ${this.outputPath}`);
  }
}

// ===== 使用示例 =====

async function main() {
  // 发送端
  const filePath = './large-file.bin';
  const fileId = 'file-' + Date.now();
  
  await sendFile(filePath, async (data, index, isLast) => {
    const message = createFileChunk(fileId, index, 100, data, isLast);
    // 发送到网络...
    console.log(`Sent chunk ${index}, size: ${data.length}`);
  });

  // 接收端
  const receiver = new FileReceiver(fileId, 100, './received-file.bin');
  // 从网络接收...
  // await receiver.receiveChunk(chunkData);
}

main().catch(console.error);
