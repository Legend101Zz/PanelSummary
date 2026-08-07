import type { AgentRunResult, ScrollStackAgentRuntime } from "@scrollstack/agent-runtime";
import type { AgentGoal, ContextPack } from "@scrollstack/contracts";

export type WorkerRunState = "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface WorkerRunView {
  run_id: string;
  goal_id: string;
  stage_run_id: string;
  goal_type: AgentGoal["goal_type"];
  state: WorkerRunState;
  correlation_id: string;
  created_at: string;
  started_at: string;
  finished_at?: string;
  result?: AgentRunResult;
  error?: { code: string; message: string };
}

interface LiveRun extends WorkerRunView {
  controller: AbortController;
  completion: Promise<void>;
  cancelReason?: "user" | "timeout";
}

export class CapacityError extends Error {
  constructor(public readonly limit: number) {
    super(`Agent worker concurrency limit reached (${limit})`);
    this.name = "CapacityError";
  }
}

export interface RunRegistryOptions {
  runtime: ScrollStackAgentRuntime;
  maxConcurrentRuns: number;
  runTimeoutMs: number;
  now?: () => Date;
}

function publicView(run: LiveRun): WorkerRunView {
  const { controller: _controller, completion: _completion, cancelReason: _cancelReason, ...view } = run;
  return view;
}

export class RunRegistry {
  private readonly runs = new Map<string, LiveRun>();
  private activeRuns = 0;
  private readonly now: () => Date;

  constructor(private readonly options: RunRegistryOptions) {
    this.now = options.now ?? (() => new Date());
  }

  get activeCount(): number {
    return this.activeRuns;
  }

  start(input: {
    goal: AgentGoal;
    context: ContextPack;
    instructions?: string;
    correlationId: string;
  }): LiveRun {
    const executionId = input.goal.goal_id;
    const existing = this.runs.get(executionId);
    if (existing?.state === "RUNNING" || existing?.state === "SUCCEEDED") return existing;
    if (this.activeRuns >= this.options.maxConcurrentRuns) {
      throw new CapacityError(this.options.maxConcurrentRuns);
    }

    const controller = new AbortController();
    const timestamp = this.now().toISOString();
    const run: LiveRun = {
      run_id: executionId,
      goal_id: input.goal.goal_id,
      stage_run_id: input.goal.stage_run_id,
      goal_type: input.goal.goal_type,
      state: "RUNNING",
      correlation_id: input.correlationId,
      created_at: timestamp,
      started_at: timestamp,
      controller,
      completion: Promise.resolve(),
    };
    this.runs.set(run.run_id, run);
    this.activeRuns += 1;

    const timeout = setTimeout(() => {
      run.cancelReason = "timeout";
      controller.abort("agent run timeout");
      void this.options.runtime.cancel(run.run_id);
    }, this.options.runTimeoutMs);

    run.completion = this.options.runtime
      .run(input.goal, input.context, {
        correlation_id: input.correlationId,
        instructions: input.instructions,
        signal: controller.signal,
      })
      .then((result) => {
        run.state = "SUCCEEDED";
        run.result = result;
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown agent runtime failure";
        if (run.cancelReason === "user") {
          run.state = "CANCELLED";
          run.error = { code: "RUN_CANCELLED", message: "Agent run cancelled" };
        } else if (run.cancelReason === "timeout") {
          run.state = "FAILED";
          run.error = { code: "RUN_TIMEOUT", message: "Agent run exceeded its bounded timeout" };
        } else {
          run.state = "FAILED";
          run.error = { code: "AGENT_RUNTIME_ERROR", message };
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        run.finished_at = this.now().toISOString();
        this.activeRuns -= 1;
      });
    return run;
  }

  get(runId: string): WorkerRunView | undefined {
    const run = this.runs.get(runId);
    return run ? publicView(run) : undefined;
  }

  async wait(runId: string): Promise<WorkerRunView | undefined> {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    await run.completion;
    return publicView(run);
  }

  async cancel(runId: string): Promise<WorkerRunView | undefined> {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    if (run.state !== "RUNNING") return publicView(run);
    run.cancelReason = "user";
    run.controller.abort("user cancellation");
    await this.options.runtime.cancel(runId);
    await run.completion;
    return publicView(run);
  }
}
