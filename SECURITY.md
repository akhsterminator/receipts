# Security and privacy

## Reporting a vulnerability

Please **don't** open a public issue. Use GitHub's private vulnerability reporting (Security → Report a vulnerability) on this repository. You'll get a reply within 5 working days.

Especially welcome: personal data that survives redaction, ways to make a quote pass verification without appearing in its source, and ways for feedback content to execute script in the evidence map.

## What Receipts does with your data

- **Nothing leaves your machine** unless you choose a model provider. With the default offline extractor or Ollama, no network calls are made except `receipts github`, which reads public issues from api.github.com.
- **Personal data is removed before anything is stored or sent to a model:** emails, phone numbers, card numbers (Luhn-checked), IBANs, national IDs, IP addresses, street addresses, postcodes, social handles, API keys and tokens, names in greetings, sign-offs and self-introductions, names from CSV name columns, and transcript speaker names.
- **Customer identities are salted hashes.** The salt lives in `.receipts/.salt`, which is gitignored. Without it, a committed store can't be reversed by hashing a list of known emails.
- **With Claude**, redacted text is sent to the Anthropic API under your own API key and your organisation's data terms.
- **No telemetry.** Receipts doesn't phone home.

## Limits

Redaction is pattern-based. It catches the common cases and is deliberately aggressive, but it isn't a compliance guarantee: names mentioned in passing ("I asked Priya about it") can survive. Review `receipts sources` and the store before committing it or sharing the evidence map, and use `privacy.patterns` in your config for identifiers specific to your business.
