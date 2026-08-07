import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { FastifyReply, FastifyRequest } from "fastify";

export interface ServiceAuthOptions {
  secret: string;
  maxAgeMs: number;
  now?: () => number;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(",")}}`;
}

function bodyHash(body: unknown): string {
  return createHash("sha256").update(canonicalJson(body ?? null)).digest("hex");
}

function sign(secret: string, timestamp: string, nonce: string, method: string, path: string, body: unknown) {
  return createHmac("sha256", secret)
    .update(`${timestamp}\n${nonce}\n${method.toUpperCase()}\n${path}\n${bodyHash(body)}`)
    .digest("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSignedServiceToken(input: {
  secret: string;
  method: string;
  path: string;
  body?: unknown;
  timestamp?: number;
  nonce?: string;
}): string {
  const timestamp = String(input.timestamp ?? Date.now());
  const nonce = input.nonce ?? randomBytes(12).toString("hex");
  const signature = sign(input.secret, timestamp, nonce, input.method, input.path, input.body);
  return `v1.${timestamp}.${nonce}.${signature}`;
}

export function createServiceAuthHook(options: ServiceAuthOptions) {
  const now = options.now ?? Date.now;
  const seenNonces = new Map<string, number>();

  return async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.url.startsWith("/internal/")) return;

    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      await reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Bearer service token required" } });
      return;
    }
    const token = authorization.slice("Bearer ".length);
    if (constantTimeEqual(token, options.secret)) return;

    const [version, timestampRaw, nonce, signature, ...extra] = token.split(".");
    const timestamp = Number(timestampRaw);
    if (
      version !== "v1" ||
      !timestampRaw ||
      !nonce ||
      !signature ||
      extra.length > 0 ||
      !Number.isSafeInteger(timestamp) ||
      Math.abs(now() - timestamp) > options.maxAgeMs
    ) {
      await reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid signed service token" } });
      return;
    }

    for (const [usedNonce, expiresAt] of seenNonces) {
      if (expiresAt <= now()) seenNonces.delete(usedNonce);
    }
    if (seenNonces.has(nonce)) {
      await reply.code(401).send({ error: { code: "REPLAYED_TOKEN", message: "Signed token nonce was already used" } });
      return;
    }

    const path = request.url;
    const expected = sign(options.secret, timestampRaw, nonce, request.method, path, request.body);
    if (!constantTimeEqual(signature, expected)) {
      await reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Invalid signed service token" } });
      return;
    }
    seenNonces.set(nonce, timestamp + options.maxAgeMs);
  };
}
