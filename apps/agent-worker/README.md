# ScrollStack agent worker

Internal Fastify service for bounded Pi sessions. It has no MongoDB, object
storage, image-provider, or repository credentials. The only model-visible
capabilities are the goal-specific domain tools brokered through the FastAPI
control plane.

Required environment:

- `AGENT_WORKER_TOKEN` (at least 16 characters)
- `DOMAIN_TOOL_BROKER_URL`
- `DOMAIN_TOOL_BROKER_TOKEN` (at least 16 characters)
- the model credential named by `AGENT_MODEL_API_KEY_ENV` (defaults to
  `OPENAI_API_KEY`)

Optional bounds:

- `AGENT_MAX_CONCURRENCY` (default `2`)
- `AGENT_WORKER_MAX_REQUEST_BYTES` (default `2097152`)
- `AGENT_WORKER_RUN_TIMEOUT_MS` (default `900000`)
- `AGENT_WORKER_TOOL_TIMEOUT_MS` (default `20000`)

Internal callers may use the static bearer token or a single-use signed bearer
token: `v1.<timestamp_ms>.<nonce>.<hmac_sha256>`. The signature covers the
timestamp, nonce, method, request path, and canonical request-body hash. The
exported `createSignedServiceToken` helper in `src/security/auth.ts` is the
canonical signer.

`POST /internal/v1/agent-runs` waits for the bounded result by default. Send
`Prefer: respond-async` to receive `202`, then poll the GET endpoint or call the
cancel endpoint using the goal's `run_id`.
