import { describe, it, expect, vi } from 'vitest'
import {
  INFO_DESCRIPTION,
  OPERATION_DOCS,
  CuratedOperationId,
} from './claudiaAdminDocs'
import { generateOpenApiDocument } from '@lilyrose2798/trpc-openapi'
import { claudiaAdminRouter } from '@/helpers/server/routers/claudiaAdminRouter'

vi.mock('@typebot.io/lib/prisma', () => ({ default: {} }))

const EXPECTED_OPERATIONS: CuratedOperationId[] = [
  'createTypebot',
  'updateTypebot',
  'publishTypebot',
  'getTypebot',
  'listTypebots',
  'listTypebotsClaudia',
  'getTypebotHistory',
  'runTypebotDraft',
]

describe('claudia-admin docs', () => {
  it('documents every curated operation with a summary and a description', () => {
    for (const operationId of EXPECTED_OPERATIONS) {
      expect(OPERATION_DOCS[operationId]?.summary).toBeTruthy()
      expect(OPERATION_DOCS[operationId]?.description).toBeTruthy()
    }
  })

  it('tells the agent how to debug with runTypebotDraft', () => {
    const doc = OPERATION_DOCS.runTypebotDraft.description
    expect(doc).toContain('status')
    expect(doc).toContain('error')
    expect(doc).toContain('updateTypebot')
    expect(doc).toContain('publishTypebot')
  })

  it('no longer claims the API cannot run flows', () => {
    expect(INFO_DESCRIPTION).not.toContain('does not run or test flows')
    expect(INFO_DESCRIPTION).toContain('runTypebotDraft')
  })

  it('generates a valid OpenAPI doc that serves every curated operation', () => {
    const doc = generateOpenApiDocument(claudiaAdminRouter, {
      title: 'Typebot Claudia Admin API',
      version: '1.0.0',
      baseUrl: 'https://example.com/api',
    })
    const operationIds = Object.values(doc.paths ?? {}).flatMap((pathItem) =>
      Object.values(pathItem as Record<string, { operationId?: string }>).map(
        (operation) => operation?.operationId
      )
    )
    for (const operationId of EXPECTED_OPERATIONS)
      expect(operationIds).toContain(operationId)
    expect(
      (
        doc.paths as Record<
          string,
          Record<string, { responses?: Record<string, unknown> }>
        >
      )?.['/v1/typebots/{typebotId}/preview/run']?.post?.responses?.['200']
    ).toBeDefined()
  })
})
