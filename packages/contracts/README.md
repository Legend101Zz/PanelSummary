# ScrollStack shared contracts

Mrigesh owns this integration seam. Canonical Pydantic models export JSON
Schema here, and TypeScript types are generated from those schemas.

Consumers must import generated types and validate fixtures; never hand-edit
generated files or introduce a competing local contract. See the root
`AGENTS.md` for the contract-change and review workflow.

Public package: `@scrollstack/contracts`.

- `schema/*.schema.json` is deterministically exported from Pydantic.
- `src/generated/*.ts` is produced by `json-schema-to-typescript`.
- `src/validators.ts` compiles the schemas with Ajv 2020.
- `../fixtures/manifest.json` is the cross-language fixture index.

Run `npm run generate`, `npm run check:generated`, `npm run build`, and
`npm test` from this directory. Generated files must travel with the canonical
Python source change and must never be hand-edited.
