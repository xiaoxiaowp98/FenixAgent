/**
 * Agent 节点执行器 — 通过 Transport 接口与 AI Agent 通信。
 *
 * 职责：
 * - 类型守卫：仅处理 'agent' 节点
 * - 模板解析：将 prompt/agent/skill 中的 ${{ }} 替换为实际值
 * - Transport 连接：connect → execute → 收集响应
 * - 重试：默认 2 次指数退避（不同于 ShellNode 的 0 次）
 * - 事件发射：node.started / node.completed / node.failed / node.retrying
 */

import { nanoid } from 'nanoid';
import type { AgentNodeDef, NodeDef } from '../types/dag';
import type { NodeExecutor, NodeExecutionContext } from '../scheduler/dag-scheduler';
import type { NodeOutput } from '../types/execution';
import { resolveTemplate } from '../parser/expression-parser';
import type { EvalContext } from '../types/expression';
import type { Transport, AgentRequest, AgentResponse } from '../transport/transport';
import { WorkflowError, WorkflowErrorCode } from '../types/errors';

// ---------- 常量 ----------

const DEFAULT_RETRY_DELAY_MS = 1000;

// ---------- AgentExecutor ----------

/** Agent 节点执行器 */
export class AgentExecutor implements NodeExecutor {
  constructor(private transport: Transport) {}

  async execute(node: NodeDef, ctx: NodeExecutionContext): Promise<NodeOutput> {
    if (node.type !== 'agent') {
      throw new WorkflowError(
        `AgentExecutor only handles 'agent' nodes, got '${node.type}'`,
        WorkflowErrorCode.NODE_FAILED,
      );
    }

    const agentNode = node as AgentNodeDef;
    const evalContext = this.buildEvalContext(ctx);

    // 解析模板
    const resolvedPrompt = resolveTemplate(agentNode.prompt, evalContext);
    const resolvedAgent = agentNode.agent ? resolveTemplate(agentNode.agent, evalContext) : undefined;
    const resolvedSkill = agentNode.skill ? resolveTemplate(agentNode.skill, evalContext) : undefined;

    // 重试配置：默认 2 次（ShellNode 默认 0 次）
    const retryConfig = agentNode.retry ?? { count: 2, delay: DEFAULT_RETRY_DELAY_MS, backoff: 'exponential' };
    const maxAttempts = (retryConfig.count ?? 2) + 1;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // 重试时发射 node.retrying 事件
      if (attempt > 0) {
        const baseDelay = retryConfig.delay ?? DEFAULT_RETRY_DELAY_MS;
        const multiplier = retryConfig.backoff === 'exponential' ? Math.pow(2, attempt - 1) : 1;
        const jitter = 0.5 + Math.random() * 0.5;
        const delay = Math.round(baseDelay * multiplier * jitter);

        await this.emitEvent(ctx, 'node.retrying', agentNode, {
          attempt: attempt + 1,
          max_attempts: maxAttempts,
          next_delay_ms: delay,
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        return await this.executeOnce(agentNode, ctx, resolvedPrompt, resolvedAgent, resolvedSkill);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // AbortError（取消）不重试
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new WorkflowError(
            'Node cancelled',
            WorkflowErrorCode.DAG_CANCELLED,
            { node_id: node.id },
          );
        }

        // 最后一次失败直接抛出
        if (attempt === maxAttempts - 1) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new WorkflowError('All retry attempts exhausted', WorkflowErrorCode.NODE_FAILED);
  }

  /** 单次执行：connect → execute → 收集输出 */
  private async executeOnce(
    node: AgentNodeDef,
    ctx: NodeExecutionContext,
    resolvedPrompt: string,
    resolvedAgent: string | undefined,
    resolvedSkill: string | undefined,
  ): Promise<NodeOutput> {
    // 发射 node.started 事件
    await this.emitEvent(ctx, 'node.started', node, {
      inputs: ctx.resolvedInputs,
      agent: resolvedAgent,
      skill: resolvedSkill,
    });

    // 连接 Transport
    const session = await this.transport.connect(resolvedAgent ?? 'default', {
      cwd: node.cwd,
    });

    // 构建请求
    const request: AgentRequest = {
      prompt: resolvedPrompt,
      agent: resolvedAgent,
      skill: resolvedSkill,
      cwd: node.cwd,
      signal: ctx.signal,
    };

    // 执行请求
    const response = await session.execute(request);

    const outputSize = Buffer.byteLength(response.stdout);

    // 非零退出码 → 失败
    if (response.exit_code !== 0) {
      await this.emitEvent(ctx, 'node.failed', node, {
        error: `Agent exited with code ${response.exit_code}`,
        exit_code: response.exit_code,
      });
      throw new WorkflowError(
        `Agent exited with code ${response.exit_code}`,
        WorkflowErrorCode.NODE_FAILED,
        { node_id: node.id, exit_code: response.exit_code, stdout: response.stdout },
      );
    }

    // 尝试解析 JSON
    let json: unknown;
    try {
      json = JSON.parse(response.stdout);
    } catch {
      // stdout 不是合法 JSON，json 留 undefined
    }

    // 发射 node.completed 事件（含 token 统计）
    await this.emitEvent(ctx, 'node.completed', node, {
      exit_code: response.exit_code,
      output_size: outputSize,
      tokens: response.tokens,
      model: response.model,
      latency_ms: response.latency_ms,
    });

    return {
      stdout: response.stdout,
      json,
      exit_code: response.exit_code,
      size: outputSize,
    };
  }

  /** 构建表达式求值上下文 */
  private buildEvalContext(ctx: NodeExecutionContext): EvalContext {
    return {
      params: ctx.params,
      secrets: ctx.secrets,
    };
  }

  /** 发射事件到 storage */
  private async emitEvent(
    ctx: NodeExecutionContext,
    type: import('../types/execution').EventType,
    node: AgentNodeDef,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const event: import('../types/execution').DAGEvent = {
      event_id: `evt_${nanoid(10)}`,
      run_id: ctx.runId,
      node_id: node.id,
      node_type: node.type,
      timestamp: new Date().toISOString(),
      type,
      ...(metadata ? { metadata } : {}),
    };
    await ctx.storage.appendEvent(event);
  }
}
