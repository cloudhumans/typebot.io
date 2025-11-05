# Plano de Implementação: Graceful Shutdown & Drain em Kubernetes

## 1. Objetivo

Garantir que as aplicações `typebot-builder` e `typebot-viewer` desliguem de forma **gradual**, sem perda de requisições ativas, evitando interrupções de sessão do usuário e reduzindo erros durante rollouts e autoscaling.

## 2. Escopo

Inclui:

- Novos endpoints `/healthz` (readiness/liveness) e `/drain` (início do processo de desligamento).
- Ajustes nos `Deployments` para suportar drain via `preStop` + alteração de readiness.
- Alinhamento de `terminationGracePeriodSeconds` com janelas de drain (ex: 60s–90s).
- Estratégia de detecção de memória e pré‑degradação de readiness (opcional fase 2).
- Integração futura de métricas de memória no HPA (CPU + memória).

Não inclui (fora do escopo imediato):

- Refatoração completa de logging ou tracing.
- Remoção de PM2 (pode ser feita depois, plano compatível com sem PM2).

## 3. Arquitetura Atual (Resumo)

- Pods usam somente path `/health` nas probes (liveness + readiness) com status HTTP.
- `terminationGracePeriodSeconds`: 30 (insuficiente para drain completo em cenários de requisições long-lived / bursts).
- Sem endpoint explícito para sinalizar drain; rely padrão em SIGTERM.
- HPA hoje baseado em CPU (memória não aplicada).
- Build produz imagem por app via Docker multi-stage.

## 4. Mudanças Propostas (Visão Geral)

| Item                                       | Ação                                                   | Resultado                          |
| ------------------------------------------ | ------------------------------------------------------ | ---------------------------------- |
| Endpoint `/healthz`                        | Implementar resposta dinâmica (READY/DRAINING)         | Probes mais precisas               |
| Endpoint `/drain`                          | Marca estado interno `isDraining=true` e retorna 202   | Início de graceful shutdown        |
| PreStop hook                               | Chamar `curl -s -X POST http://localhost:<PORT>/drain` | Garante transição antes do SIGTERM |
| Readiness dinâmica                         | Quando `isDraining` for true retornar HTTP 503         | Remove pod do load balancer        |
| Aumento terminationGracePeriod             | Ajustar para 60–90s                                    | Janela para concluir requisições   |
| Timeout interno de forced exit             | Definir (ex: kill_timeout - 5s)                        | Evita travamento                   |
| Métrica memória                            | Expor gauge (phase 2)                                  | Base futura para HPA memória       |
| Política de degradar readiness por memória | readiness 503 acima de threshold (ex: >85% limite)     | Proteção contra OOM                |

## 5. Endpoints

### 5.1 `/healthz` (Substitui /health nas probes)

- Método: GET
- Respostas:
  - 200 `{ status: "ready", draining: false, uptimeSeconds, mem: { rss, heapUsed, limitMB } }`
  - 200 (durante drain mas enquanto aceita terminar conexões) `{ status: "draining", draining: true }` (Opcional manter 200 primeiros N segundos para permitir closures) OU diretamente 503.
  - 503 `{ status: "draining" }` quando já não deve receber novas requisições.
- Liveness sempre retorna 200 se processo não está travado (se estado fatal -> 500).

### 5.2 `/drain`

- Método: POST
- Ações:
  1. Set flag global `isDraining=true`.
  2. Registrar timestamp `drainStartedAt`.
  3. Opcional: iniciar timer interno para forced shutdown (ex: kill_timeout - 5s).
  4. Log estruturado: `{ event: "drain_start", time, pid }`.
- Resposta: `202 Accepted`.
- Idempotente: múltiplas chamadas não reiniciam timers.

## 6. Ciclo de Vida de Shutdown

1. Kubernetes envia `preStop` -> POST `/drain`.
2. App seta `isDraining=true`.
3. Readiness probe começa a falhar (503) => Pod removido do Service/Endpoints.
4. Conexões ativas continuam sendo servidas até:
   - Fim natural das requisições
   - Timeout interno (ex: 55s se kill_timeout=60s)
   - Memória crítica / erro fatal.
5. Recebe SIGTERM (geral) dentro da janela do pod e executa `server.close()`.
6. Após finalizar ou atingir forced timeout -> processo encerra.

## 7. Ajustes Kubernetes (Deployments)

Mudanças a aplicar nos manifests:

- Substituir `/health` por `/healthz` em `livenessProbe` e `readinessProbe`.
- Adicionar lifecycle:

```yaml
lifecycle:
  preStop:
    exec:
      command:
        [
          '/bin/sh',
          '-c',
          'curl -fs -X POST http://localhost:3000/drain || true',
        ]
```

(ajustar porta por app)

- Ajustar `terminationGracePeriodSeconds: 60` (ou 75/90 se carga média de requisições longas >30s).
- Opcional: annotation `app.graceful/drain-enabled: "true"` para rastreabilidade.

## 8. Estrutura de Código (Sugestão Futura)

Assunção: criaremos camada utilitária (ex: `packages/lib/graceful-lifecycle.js`).
Responsáveis:

- Exportar função `createGracefulState()` com: `{ isDraining, drain(), shouldRefuseNewRequests(), memoryProbe() }`.
- Middleware para bloquear novas requisições se `isDraining` e fase pós-grace (ex: após 5s).
- Router para `/healthz` e `/drain` (pode ser adaptado a Next API Route / Edge Handler ou custom server).

## 9. Estratégia de Readiness Durante Drain

Opções:
A) Imediato: readiness devolve 503 assim que `isDraining=true`. (Simples, remove pod rápido.)
B) Atrasado: manter 200 por N segundos (ex: 5s) para reduzir risco de falhas se o LB reenvia requisições repetidas. (Melhor para tráfego intenso.)
Decisão inicial: A) (simplificar); Reavaliar após métricas.

## 10. Detecção de Memória (Fase 2)

- Ler cgroup (`/sys/fs/cgroup/memory.max` ou equivalente) + `process.memoryUsage()`.
- Calcular `usagePercent = rss / limit`.
- Se `usagePercent > 0.85` e não drenando: iniciar pré-drain (set `isDraining=true` + readiness 503).
- Expor métrica interna via `/healthz` e futura `/metrics` (Prometheus style) ou Log para Datadog.

## 11. Integração com HPA (Fase 2)

- Adicionar resource metric de memória: `type: Resource` / `name: memory` / `targetAverageUtilization` (ex: 75%).
- Alternativa avançada: Custom metric (tempo médio de resposta ou fila interna) para escalar antecipadamente.

## 12. Edge Cases & Mitigações

| Caso                                  | Risco                        | Mitigação                                                                |
| ------------------------------------- | ---------------------------- | ------------------------------------------------------------------------ | --- | -------------------- |
| Requisição longa > gracePeriod        | Forçado a fechar cedo        | Aumentar gracePeriod / logs para tuning                                  |
| `/drain` falha no preStop             | Sem transição de readiness   | SIGTERM ainda segue; liveness mata se falhar; adicionar retry curl com ` |     | sleep 1 && curl ...` |
| Pico de memória súbito                | OOM antes drain              | Pré-drain por threshold + logs métricas                                  |
| Race: drain + novo deploy             | Pod antigo e novo competindo | Readiness 503 rápido no antigo                                           |
| Forçado sem PM2 kill_timeout alinhado | Encerramento abrupto         | Documentar necessidade de env var padronizado                            |
| Healthz cache/reverse proxy           | Status stale                 | Desabilitar cache para `/healthz` (headers no-store)                     |

## 13. Cronograma (Fases)

Fase 1 (Dia 0–2): Endpoints + ajustes Deploy + gracePeriod.
Fase 1.1 (Dia 3–4): Observabilidade básica (logs structured drain events).
Fase 2 (Semana 2): Memória -> pré-drain + HPA memory metric.
Fase 3 (Semana 3+): Métricas avançadas (latência) e ajuste adaptativo.

## 14. Riscos & Mitigações (Resumo)

- Timeout insuficiente -> Monitorar tempo médio de requisição e ajustar.
- Falha de preStop -> Retry ou fallback direto via SIGTERM.
- Conexões WebSocket persistentes -> Mapear e fechar gracioso antes do forced exit.
- Falta de coordenação kill_timeout vs terminationGracePeriod -> Padronizar em variável única (ex: `GRACEFUL_TIMEOUT_MS`).

## 15. Checklist de Validação

- [ ] `/healthz` retorna 200 em estado normal.
- [ ] POST `/drain` muda readiness para 503 em <1s.
- [ ] PreStop executa e log `drain_start` aparece.
- [ ] Rollout: zero 5xx por desconexão abrupta comparado baseline.
- [ ] Termination dentro da janela configurada (log start->exit < gracePeriod).
- [ ] Métricas memória capturadas (fase 2).
- [ ] HPA reage a pico de memória (fase 2).

## 16. Assunções

- Será adicionado código de servidor custom ou API Routes para expor endpoints.
- Logs estruturados disponíveis em Datadog (campos: service, env, event, status).
- Aplicações não possuem requisições > 60s como padrão (se houver, reavaliar gracePeriod >90s).

## 17. Próximos Passos Imediatos

1. Implementar `/healthz` e `/drain` (Next API Route ou custom server).
2. Alterar manifests: probes + lifecycle + terminationGracePeriodSeconds.
3. Ajustar pipelines para validar novo endpoint no smoke test.
4. Coletar métricas de tempo médio de requisição antes de aumentar ou diminuir janela.

## 18. Referências

- Kubernetes Docs: Graceful Termination & Pod Lifecycle.
- Node.js HTTP server.close behavior.
- Datadog structured logging.

---

Este documento estabelece o blueprint inicial. Ajustes finos ocorrerão após métricas reais de tráfego e latência.
