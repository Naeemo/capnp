/**
 * 代码生成任务管理器
 * 支持断点续传和自动重试
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface TaskStatus {
  taskId: string;
  completed: boolean;
  attempts: number;
  lastError?: string;
  timestamp: number;
}

const TASK_FILE = join(process.cwd(), '.codegen-tasks.json');
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export class TaskManager {
  private tasks: Map<string, TaskStatus> = new Map();

  constructor() {
    this.loadTasks();
  }

  private loadTasks(): void {
    if (existsSync(TASK_FILE)) {
      try {
        const data = JSON.parse(readFileSync(TASK_FILE, 'utf-8'));
        this.tasks = new Map(Object.entries(data));
      } catch {
        this.tasks = new Map();
      }
    }
  }

  private saveTasks(): void {
    const data = Object.fromEntries(this.tasks);
    writeFileSync(TASK_FILE, JSON.stringify(data, null, 2));
  }

  isTaskComplete(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    return task?.completed ?? false;
  }

  async runTask<T>(
    taskId: string,
    fn: () => Promise<T>,
    options: { maxRetries?: number; retryDelay?: number } = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? MAX_RETRIES;
    const retryDelay = options.retryDelay ?? RETRY_DELAY_MS;

    let task = this.tasks.get(taskId);
    if (!task) {
      task = { taskId, completed: false, attempts: 0, timestamp: Date.now() };
      this.tasks.set(taskId, task);
    }

    if (task.completed) {
      console.log(`[TaskManager] Task ${taskId} already completed, skipping`);
      return undefined as T;
    }

    while (task.attempts < maxRetries) {
      task.attempts++;
      console.log(`[TaskManager] Running task ${taskId}, attempt ${task.attempts}/${maxRetries}`);

      try {
        const result = await fn();
        task.completed = true;
        task.timestamp = Date.now();
        this.saveTasks();
        console.log(`[TaskManager] Task ${taskId} completed successfully`);
        return result;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        task.lastError = errorMsg;
        console.error(`[TaskManager] Task ${taskId} failed: ${errorMsg}`);

        if (task.attempts < maxRetries) {
          console.log(`[TaskManager] Retrying in ${retryDelay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    this.saveTasks();
    throw new Error(
      `Task ${taskId} failed after ${maxRetries} attempts. Last error: ${task.lastError}`
    );
  }

  resetTask(taskId: string): void {
    this.tasks.delete(taskId);
    this.saveTasks();
  }

  listTasks(): TaskStatus[] {
    return Array.from(this.tasks.values());
  }
}

// 全局任务管理器实例
export const taskManager = new TaskManager();
