# Prompt-injection fixtures (blueprint §14, ADR-012)

These fixtures are deliberately **outside `manifest.json`**: the canonical
fixture test asserts that the manifest's schema set exactly equals the schema
registry, so adding adversarial documents there would break it. They are loaded
by path from the injection suites instead.

| File | What it carries |
| --- | --- |
| `malicious_context_pack.v1.json` | A schema-valid `context_pack.v1` whose *book text* is the attack: an "IGNORE ALL PREVIOUS INSTRUCTIONS" override in the source excerpt and its quote, a validator-disabling "developer note" in the canon synopsis, and a fake `<system>` block in the continuity summary. It also names a source unit (`unit_attacker_tool`) that is not in the pack. |
| `malicious_agent_goal.v1.json` | A goal that requests `bash`, `read`, and `write` alongside a legitimate submission tool. |

## What the suites assert

TypeScript (`packages/agent-runtime/test/injection.test.ts`):

- a goal requesting built-in tools is rejected by `assertGoalPolicy`
  (`UNKNOWN_TOOL`) before any session is created;
- `productionSessionPolicy` pins `noTools: "builtin"` and excludes every
  built-in capability, and the brokered tool set is exactly the goal's
  allowlist — pack content cannot add a tool;
- an out-of-allowlist tool name has no schema/definition, so it cannot be
  invoked at all;
- the tool-call and repair budgets still bind under adversarial input.

Python (`backend/tests/test_prompt_injection_v2.py`):

- the domain-tool broker rejects an unknown/built-in tool name (`bash`,
  `read`, …) with `NotFoundError` — fail closed, no execution;
- source excerpts named only inside the attack text are refused
  (`AuthorizationError`), so a plan cannot cite fabricated evidence;
- a MangaPlan whose `source_ref` was hand-forged (right ID, wrong
  `text_hash`) is refused;
- injected text is returned as **data** with its untrusted framing intact and
  is never executed or interpreted as a directive by the control plane.

No live model is involved in any of these tests. They assert the *capability
boundary* — the property the architecture actually guarantees — not that a
model chose to behave.
