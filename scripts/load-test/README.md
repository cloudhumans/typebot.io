# Load test for Typebot endpoint

This small subproject runs a configurable number of concurrent POST requests against the preview startChat endpoint used in the provided curl.

Installation

Use pnpm (repo appears to use pnpm), or npm/yarn in the `scripts/load-test` folder to install dependencies:

```bash
pnpm install --prefix ./scripts/load-test
# or
npm install --prefix ./scripts/load-test
```

Usage

Default command (100 requests, concurrency 10):

```bash
pnpm --prefix ./scripts/load-test start
```

Override options:

- --concurrency (or -c): concurrent requests
- --total (or -t): total requests
- --url: full URL to POST
- --token or --auth: bearer token
- --timeout: per-request timeout in ms
- --timeout: per-request timeout in ms
- --out (or -o): path to write CSV results (default: `results-<timestamp>.csv` in the load-test directory)
- --message or --msg: message text to send to the session after startChat (default: "olá. você conhece boas receitas de bolo?")

Example: 1000 requests with concurrency 50

```bash
pnpm --prefix ./scripts/load-test start -- --concurrency 50 --total 1000
```

Notes

- The script sends an empty JSON body ({}) matching `--data ''` in the example curl.
- It prints interim progress and a final report with p50/p90/p99 latencies.
