// No-op dd-trace stub for client bundles.
module.exports = {
  tracer: {
    scope: () => ({
      active: () => ({
        context: () => ({
          toTraceId: () => null,
          toSpanId: () => null,
        }),
      }),
    }),
  },
}
