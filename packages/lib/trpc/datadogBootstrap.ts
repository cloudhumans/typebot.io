// Early bootstrap for Datadog tracer (Node runtime only)
// Loaded before most application code to maximize auto-instrumentation coverage.
// Safe: wraps require in try/catch.
// Control via env:
//   TYPEBOT_DD_DISABLE=1 -> skip init
//   TYPEBOT_DD_SERVICE overrides service name
//   DD_ENV / NODE_ENV for environment
//   DD_VERSION for version tag
// NOTE: Edge runtime and browser bundles are ignored.
import { initDatadog } from './datadogCore'
// Side-effect bootstrap delegating to unified core.
initDatadog({})
export {}
