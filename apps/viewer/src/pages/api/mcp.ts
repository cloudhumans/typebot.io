import { NextApiRequest, NextApiResponse } from 'next'
import {
  getWorkflowTools,
  executeWorkflow,
  sanitizeToolName,
  transformToMCPTool,
  checkBearerAuth,
} from '@typebot.io/mcp-tools'
import { env } from '@typebot.io/env'
import logger from '@/helpers/logger'

/**
 * MCP (Model Context Protocol) endpoint.
 * Handles Streamable HTTP transport for MCP clients.
 *
 * Tenant is extracted from:
 * - x-tenant header
 * - tenant header
 * - tenant query parameter
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-tenant, tenant, mcp-session-id, Authorization, X-MCP-Access-Token, x-include-drafts'
  )

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Bearer auth gate. Applies to every non-preflight method (GET/POST/DELETE).
  // This is an HTTP-level guard — unauthorized requests get a real 401, never
  // a JSON-RPC 200 envelope. Fail-closed: a missing server token yields 401.
  const auth = checkBearerAuth(
    req.headers.authorization,
    env.TYPEBOT_TOOLS_API_TOKEN
  )
  if (!auth.authorized) {
    if (auth.reason === 'misconfigured')
      logger.warn(
        'MCP endpoint misconfigured: TYPEBOT_TOOLS_API_TOKEN is not set, rejecting all requests'
      )
    // The CH-MCP proxy masks a 401 as an empty tools list, so this server-side
    // log is the only evidence of a wrong/rotated token or brute-force against
    // this public path. Never log the received token value.
    else
      logger.warn('MCP endpoint rejected unauthorized request', {
        reason: auth.reason,
        method: req.method,
      })
    res.setHeader('WWW-Authenticate', 'Bearer realm="mcp"')
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Extract tenant from headers or query. Headers and query params can be
  // string arrays when sent multiple times (e.g. ?tenant=a&tenant=b), so we
  // always normalize to the first value.
  const firstValue = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value

  const tenant =
    firstValue(req.headers['x-tenant']) ||
    firstValue(req.headers['tenant']) ||
    firstValue(req.query.tenant)

  if (req.method === 'GET') {
    // SSE endpoint for server-to-client messages
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    // Establishing the stream
    res.write('retry: 1000\n\n')

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(':keepalive\n\n')
    }, 30000)

    req.on('close', () => {
      clearInterval(keepAlive)
      res.end()
    })

    return
  }

  if (req.method === 'POST') {
    try {
      const body = req.body

      // Validate the JSON-RPC envelope before dispatching.
      if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return res.status(200).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid Request',
          },
          id: null,
        })
      }

      // Handle JSON-RPC request
      const { method, params, id } = body

      if (typeof method !== 'string') {
        return res.status(200).json({
          jsonrpc: '2.0',
          error: {
            code: -32600,
            message: 'Invalid Request',
          },
          id: id ?? null,
        })
      }

      if (method === 'initialize') {
        logger.info('MCP initialize', { tenant, requestId: id })
        return res.status(200).json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'typebot-mcp',
              version: '1.0.0',
            },
          },
          id,
        })
      }

      if (method === 'tools/list') {
        if (!tenant) {
          logger.warn('MCP tools/list called without tenant', { requestId: id })
          return res.status(200).json({
            jsonrpc: '2.0',
            result: { tools: [] },
            id,
          })
        }

        // `includeDrafts` opts the caller into receiving unpublished
        // tools too. Only honoured via the `x-include-drafts` header
        // (set by claudia web-api when proxying from the Tools page).
        // Agents never set this header so they only see published tools.
        const includeDrafts = req.headers['x-include-drafts'] === 'true'

        logger.info('MCP tools/list', { tenant, includeDrafts, requestId: id })
        const { tools } = await getWorkflowTools({ tenant, includeDrafts })

        const mcpTools = tools.map(transformToMCPTool)
        logger.info('MCP tools/list completed', {
          tenant,
          includeDrafts,
          toolCount: mcpTools.length,
          requestId: id,
        })

        if (mcpTools.length === 0) {
          logger.warn(`MCP tools/list returned empty for tenant=${tenant}`, {
            tenant,
            includeDrafts,
            requestId: id,
          })
        }

        return res.status(200).json({
          jsonrpc: '2.0',
          result: { tools: mcpTools },
          id,
        })
      }

      if (method === 'tools/call') {
        if (!tenant) {
          logger.warn('MCP tools/call called without tenant', { requestId: id })
          return res.status(200).json({
            jsonrpc: '2.0',
            error: {
              code: -32600,
              message: 'x-tenant header is required for tools/call',
            },
            id,
          })
        }

        const { name, arguments: args } = params || {}

        if (typeof name !== 'string' || name.length === 0) {
          return res.status(200).json({
            jsonrpc: '2.0',
            error: {
              code: -32602,
              message: 'Invalid params: "name" is required',
            },
            id,
          })
        }

        logger.info('MCP tools/call', { tenant, toolName: name, requestId: id })

        const { tools } = await getWorkflowTools({ tenant })
        const tool = tools.find((t) => sanitizeToolName(t.name) === name)

        if (!tool) {
          logger.warn('MCP tool not found', {
            tenant,
            toolName: name,
            availableTools: tools.map((t) => sanitizeToolName(t.name)),
            requestId: id,
          })
          return res.status(200).json({
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: `Tool '${name}' not found`,
            },
            id,
          })
        }

        const startTime = Date.now()
        const { isError, output } = await executeWorkflow({
          publicId: tool.publicName,
          prefilledVariables: args as Record<string, unknown>,
        })
        const durationMs = Date.now() - startTime

        // `isError` flags a failed run that produced no usable answer (or whose
        // answer IS the typebot transport-error marker) — see executeWorkflow.
        // It rides the envelope below as `isError:true`, which makes the
        // LangChain MCP adapter (`@langchain/mcp-adapters@1.1.3`,
        // `dist/tools.js:314`) `throw new ToolException(...)` UNCONDITIONALLY on
        // `result.isError`. That throw is caught by claudia-agentic's
        // `loggingMiddleware.wrapToolCall` (`logging.ts:131`) and recorded via
        // `recordToolError` (`logging.ts:143`), which hands the LLM a synthetic
        // `status:"error"` ToolMessage — NOT the `recordToolResultError`
        // status-based branch (`logging.ts:48` / #110), which only fires when a
        // handler RETURNS a status:error ToolMessage (never on this throw path).
        // It is that throw path — not the #110 status branch — that makes the
        // `detectSwallowedToolError` shim dead code. Note: `isError:true` drops
        // the content (the agent gets the error string, not the answer), so we
        // gate it tightly. A future adapter that maps `isError`→`status:"error"`
        // instead of throwing would shift which branch fires.
        // Thrown errors take the JSON-RPC error path below.
        logger.info('MCP tools/call completed', {
          tenant,
          toolName: name,
          workflowId: tool.id,
          publicName: tool.publicName,
          durationMs,
          isError,
          requestId: id,
        })

        return res.status(200).json({
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: output }],
            ...(isError ? { isError: true } : {}),
          },
          id,
        })
      }

      if (method === 'notifications/initialized') {
        // Acknowledgment, no response needed for notifications
        return res.status(200).json({
          jsonrpc: '2.0',
          result: {},
          id,
        })
      }

      // Unknown method
      logger.warn('MCP unknown method', {
        tenant,
        method,
        requestId: id,
      })
      return res.status(200).json({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
        id,
      })
    } catch (error) {
      logger.error('MCP request failed', {
        tenant,
        method: req.body?.method,
        requestId: req.body?.id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      // Propagate the real error message: errors raised during tool execution
      // (e.g. `Missing required variable "X" for TOOL workflow` thrown by
      // executeDeclareVariables) are addressed to the calling agent, which
      // needs the message to self-correct. Masking everything as a generic
      // "Internal error" defeated that "fail loudly" contract and blinded
      // message-based observability filters. Full error + stack stay in the
      // server-side log above.
      return res.status(200).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error',
        },
        id: req.body?.id ?? null,
      })
    }
  }

  if (req.method === 'DELETE') {
    // Session termination
    return res.status(200).json({
      jsonrpc: '2.0',
      result: {},
      id: null,
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

// Raise the body parser size limit to 4mb for larger tool-call payloads.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
    externalResolver: true,
  },
}
