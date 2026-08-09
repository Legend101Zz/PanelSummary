import type {
  DomainToolBroker,
  DomainToolRequest,
  DomainToolResponse,
  JsonValue,
} from "@scrollstack/agent-runtime";

export interface HttpDomainToolBrokerOptions {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  maxResponseBytes?: number;
  fetch?: typeof fetch;
}

function isResponse(value: unknown): value is DomainToolResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { content?: unknown }).content === "string"
  );
}

export class HttpDomainToolBroker implements DomainToolBroker {
  private readonly fetchImpl: typeof fetch;
  private readonly maxResponseBytes: number;

  constructor(private readonly options: HttpDomainToolBrokerOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.maxResponseBytes = options.maxResponseBytes ?? 256 * 1024;
  }

  async execute(request: DomainToolRequest): Promise<DomainToolResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("domain tool timeout"), this.options.timeoutMs);
    const abort = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener("abort", abort, { once: true });
    try {
      const url = new URL(`/internal/v1/agent-tools/${request.name}`, this.options.baseUrl);
      const response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.token}`,
          "content-type": "application/json",
          "x-correlation-id": request.scope.correlation_id,
        },
        body: JSON.stringify({
          arguments: request.arguments,
          scope: request.scope,
        }),
        signal: controller.signal,
      });
      const text = await response.text();
      if (Buffer.byteLength(text) > this.maxResponseBytes) {
        throw new Error(`Domain tool response exceeds ${this.maxResponseBytes} bytes`);
      }
      if (!response.ok) {
        let detail = "";
        try {
          const errorPayload = JSON.parse(text) as {
            error?: { code?: unknown; message?: unknown };
          };
          const code = errorPayload.error?.code;
          const message = errorPayload.error?.message;
          if (typeof code === "string" && typeof message === "string") {
            detail = ` (${code}: ${message.slice(0, 1_000)})`;
          }
        } catch {
          // Do not reflect arbitrary proxy bodies into the sealed model session.
        }
        throw new Error(
          `Domain tool ${request.name} failed with HTTP ${response.status}${detail}`,
        );
      }
      const parsed = JSON.parse(text) as JsonValue;
      if (!isResponse(parsed)) {
        throw new Error(`Domain tool ${request.name} returned an invalid response`);
      }
      return parsed;
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abort);
    }
  }
}
