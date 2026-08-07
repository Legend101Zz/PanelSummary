# ScrollStack canonical fixtures

`manifest.json` maps each checked-in JSON payload to the canonical Pydantic
schema that must accept it. Backend pytest and the `@scrollstack/contracts`
Vitest suite both read this same manifest. These fixtures are reviewed examples,
not output generated from the models, so they can expose contract drift.
