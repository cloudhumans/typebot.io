import { describe, it, expect } from 'vitest'
import {
  INFO_DESCRIPTION,
  OPERATION_DOCS,
  CuratedOperationId,
} from './claudiaAdminDocs'

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
})
