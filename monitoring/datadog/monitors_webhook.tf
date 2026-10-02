resource "datadog_monitor" "webhook_request_loop" {
  enable_logs_sample       = false
  evaluation_delay         = 90
  group_retention_duration = "1h"
  groupby_simple_monitor   = false
  message                  = "{{#is_renotified}} ⚠️ **RENOTIFICAÇÃO: Este problema persiste há mais de 3 horas!** ⚠️ {{/is_renotified}}\nAnomalia de Execução Detectada!\n\n    Projeto/Workflow: {{[@workflow.name].name}}\n\n    Workspace: {{[@workspace.name].name}}\n\n    ID da Execução Travada: {{[@workflow.execution_id].name}}\n\n    ID do Eddie/Typebot: {{[@workflow.id].name}}\n\nAção Recomendada: Verifique se o workflow possui algum bloco de requisição HTTP sem condição de parada ou com retentativas infinitas.\n\n\n[Acessar Eddie problemático](https://eddie.us-east-1.prd.cloudhumans.io/typebots/{{[@workflow.id].name}}/edit)\n\n[Ver Logs desta Execução](https://app.datadoghq.com/logs?query=service%3Atypebot-viewer%20%40workflow.execution_id%3A{{[@workflow.execution_id].name}}&live=true)\n\n**Sugestão de mensagem pra enviar pro cliente:**\n```\nBom dia pessoal, tudo bem?\n\nRecebemos um alerta automatizado de que tem um fluxo de vocês que aparentemente tem alguma lógica com looping eterno não intencional.\n\nDados do fluxo que disparou alerta:\nFluxo: {{[@workflow.name].name}}\nWorkspace: {{[@workspace.name].name}}\n\nPossíveis impactos se realmente houver um looping no fluxo:\n\n1. Travamento do fluxo pra aquele ticket resultando em erro de execução\nExiste um fallback no nosso código que redireciona o ticket pra N2 se isso acontecer, portanto o cliente não deveria ficar sem resposta\n\n2. Lentidão no cluster Eddie que vocês estão\nEsse pode ser mais crítico pois, dependendo da quantidade de vezes e de fluxos acionados em paralelo com looping, isso pode onerar a micro instância (processo/pod do k8s) em que vocês estão hospedados, ocasionando erro em outros tickets\n\n\nPodem dar uma olhada se encontram algum looping nesse fluxo e nos informar se realmente se confirma ou se foi um falso positivo aqui? Esse nosso alerta tem se provado bem assertivo com o tempo, mas existe sempre a chance de ser um falso positivo.\n```\n\n\n@slack-alerts-typebot <!subteam^S0AE5U9T3UK>"
  name                     = "[Typebot] Loop de Requests Detectado - Projeto: {{[@workflow.name].name}} (Workspace: {{[@workspace.name].name}})"
  new_group_delay          = 90
  notify_audit             = false
  on_missing_data          = "default"
  priority                 = "1"
  query                    = "logs(\"service:typebot-viewer \\\"HTTP Request Executed\\\"\").index(\"*\").rollup(\"count\").by(\"@workflow.name,@workspace.name,@workflow.execution_id,@workflow.id\").last(\"5m\") > 55"
  renotify_interval        = 180
  renotify_occurrences     = 0
  renotify_statuses        = ["alert", "no data"]
  require_full_window      = false
  timeout_h                = 0
  type                     = "log alert"
  monitor_thresholds {
    critical = "55"
  }
  tags = ["managed_by:terraform", "service:typebot-viewer", "team:retention"]
  lifecycle {
    prevent_destroy = true
  }
}

resource "datadog_monitor" "webhook_request_loop_solides" {
  enable_logs_sample       = false
  evaluation_delay         = 90
  group_retention_duration = "1h"
  groupby_simple_monitor   = false
  message                  = "Anomalia de Execução Detectada!\n\n    Projeto/Workflow: {{[@workflow.name].name}}\n\n    Workspace: {{[@workspace.name].name}}\n\n    ID da Execução Travada: {{[@workflow.execution_id].name}}    \n\nAção Recomendada: Verifique se o workflow possui algum bloco de requisição HTTP sem condição de parada ou com retentativas infinitas.\n\n@slack-alerts-suporte\n@slack-ch-solides"
  name                     = "[ALERTA] Loop de Requests Detectado em Solides no Eddie - Projeto: {{[@workflow.name].name}} (Workspace: {{[@workspace.name].name}})"
  new_group_delay          = 90
  notify_audit             = false
  on_missing_data          = "default"
  priority                 = "1"
  query                    = "logs(\"service:typebot-viewer \\\"HTTP Request Executed\\\" @workspace.name:*solides*\").index(\"*\").rollup(\"count\").by(\"@workspace.name,@workflow.name,@workflow.execution_id\").last(\"5m\") > 30"
  renotify_interval        = 0
  renotify_occurrences     = 0
  require_full_window      = false
  timeout_h                = 0
  type                     = "log alert"
  monitor_thresholds {
    critical = "30"
    warning  = "25"
  }
  tags = ["managed_by:terraform", "service:typebot-viewer", "team:retention"]
  lifecycle {
    prevent_destroy = true
  }
}

resource "datadog_monitor" "shopee_webhook_integration_errors" {
  enable_logs_sample     = false
  evaluation_delay       = 60
  groupby_simple_monitor = false
  include_tags           = false
  message = chomp(<<-EOT
    {{#is_alert}}
    :rotating_light: *Erro no fluxo "{{[@workflow.name].name}}"*

    Integração com problema: `{{[@http.url].name}}`

    *{{value}}* requisições com erro ou acima de 20 s na última hora. Conversas desse fluxo estão indo para atendimento humano por falha.

    *O que fazer:* verificar a integração acima (API, planilha ou script) e a última publicação do fluxo.
    Abrir fluxo: https://eddie.us-east-1.prd.cloudhumans.io/typebots/{{[@workflow.id].name}}/edit

    @slack-ch-shopee @slack-alerts-shopee
    {{/is_alert}}
  EOT
  )
  name                 = "[Shopee] Erro de integração no fluxo {{[@workflow.name].name}}"
  new_group_delay      = 0
  notify_audit         = false
  on_missing_data      = "default"
  priority             = "2"
  query                = "logs(\"service:typebot-viewer @workspace.name:shopee-prod (\\\"HTTP Request Error\\\" OR \\\"HTTP Request Failed\\\" OR @http.status_code:>=400 OR @http.duration:>20000)\").index(\"*\").rollup(\"count\").by(\"@workflow.name,@workflow.id,@http.url\").last(\"1h\") > 200"
  renotify_interval    = 0
  renotify_occurrences = 0
  require_full_window  = false
  tags                 = ["kind:eddie-integration", "managed_by:terraform", "project:shopee", "service:typebot-viewer", "team:retention"]
  timeout_h            = 0
  type                 = "log alert"
  monitor_thresholds {
    critical = "200"
  }
  lifecycle {
    prevent_destroy = true
  }
}
