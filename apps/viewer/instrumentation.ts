import tracer from 'dd-trace'

if (typeof window === 'undefined') {
  try {
    if (!(tracer as any)._initialized) {
      tracer.init({
        service: process.env.DD_SERVICE || 'typebot-viewer',
        env: process.env.DD_ENV || process.env.NODE_ENV,
        version: process.env.DD_VERSION || '0.0.0',
        logInjection: true,
      })
    }
  } catch (e) {
    // silent
  }
}

export function register() {}
