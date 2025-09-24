// Executado automaticamente pelo Next.js (Node.js runtime) antes do restante do app.
// Responsável por inicializar o Datadog tracer cedo para garantir criação de spans ativos.
// Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
import tracer from 'dd-trace'

if (typeof window === 'undefined') {
  try {
    if (!(tracer as any)._initialized) {
      tracer.init({
        service: process.env.DD_SERVICE || 'typebot-builder',
        env: process.env.DD_ENV || process.env.NODE_ENV,
        version: process.env.DD_VERSION || '0.0.0',
        logInjection: true,
      })
    }
  } catch (e) {
    // Evita quebrar build/local dev em caso de init duplicado
  }
}

export function register() {
  // Next.js exige uma exportação para confirmar o registro
}
