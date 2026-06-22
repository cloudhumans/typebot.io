import { describe, expect, it } from 'vitest'
import {
  GOOGLE_SHEETS_CONNECTED_MESSAGE,
  GOOGLE_SHEETS_SPREADSHEET_PICKED_MESSAGE,
  extractPickedSpreadsheetId,
  parseGoogleSheetsConnectedMessage,
  parseGoogleSheetsSpreadsheetPickedMessage,
} from './popupMessaging'

describe('parseGoogleSheetsConnectedMessage', () => {
  it('accepts a well-formed message', () => {
    expect(
      parseGoogleSheetsConnectedMessage({
        type: GOOGLE_SHEETS_CONNECTED_MESSAGE,
        blockId: 'block-1',
        credentialsId: 'cred-1',
      })
    ).toEqual({
      type: GOOGLE_SHEETS_CONNECTED_MESSAGE,
      blockId: 'block-1',
      credentialsId: 'cred-1',
    })
  })

  const rejectedCases: { label: string; payload: unknown }[] = [
    { label: 'null', payload: null },
    { label: 'a string', payload: 'google-sheets-connected' },
    {
      label: 'a wrong type',
      payload: { type: 'other', blockId: 'b', credentialsId: 'c' },
    },
    {
      label: 'a missing blockId',
      payload: { type: GOOGLE_SHEETS_CONNECTED_MESSAGE, credentialsId: 'c' },
    },
    {
      label: 'a non-string credentialsId',
      payload: {
        type: GOOGLE_SHEETS_CONNECTED_MESSAGE,
        blockId: 'b',
        credentialsId: 1,
      },
    },
  ]
  rejectedCases.forEach(({ label, payload }) => {
    it(`rejects ${label}`, () => {
      expect(parseGoogleSheetsConnectedMessage(payload)).toBeNull()
    })
  })
})

describe('parseGoogleSheetsSpreadsheetPickedMessage', () => {
  it('accepts a well-formed message', () => {
    expect(
      parseGoogleSheetsSpreadsheetPickedMessage({
        type: GOOGLE_SHEETS_SPREADSHEET_PICKED_MESSAGE,
        spreadsheetId: 'sheet-1',
      })
    ).toEqual({
      type: GOOGLE_SHEETS_SPREADSHEET_PICKED_MESSAGE,
      spreadsheetId: 'sheet-1',
    })
  })

  const rejectedCases: { label: string; payload: unknown }[] = [
    { label: 'null', payload: null },
    { label: 'a wrong type', payload: { type: 'other', spreadsheetId: 's' } },
    {
      label: 'a non-string spreadsheetId',
      payload: {
        type: GOOGLE_SHEETS_SPREADSHEET_PICKED_MESSAGE,
        spreadsheetId: 2,
      },
    },
  ]
  rejectedCases.forEach(({ label, payload }) => {
    it(`rejects ${label}`, () => {
      expect(parseGoogleSheetsSpreadsheetPickedMessage(payload)).toBeNull()
    })
  })
})

describe('extractPickedSpreadsheetId', () => {
  it('returns the first doc id when an item is picked', () => {
    expect(
      extractPickedSpreadsheetId({
        action: 'picked',
        docs: [{ id: 'sheet-1' }, { id: 'sheet-2' }],
      })
    ).toBe('sheet-1')
  })

  const nullCases: {
    label: string
    payload: { action?: string; docs?: { id?: string }[] }
  }[] = [
    {
      label: 'the action is not "picked"',
      payload: { action: 'cancel', docs: [{ id: 'sheet-1' }] },
    },
    { label: 'there are no docs', payload: { action: 'picked', docs: [] } },
    {
      label: 'the first doc has no id',
      payload: { action: 'picked', docs: [{}] },
    },
    { label: 'docs is missing', payload: { action: 'picked' } },
  ]
  nullCases.forEach(({ label, payload }) => {
    it(`returns null when ${label}`, () => {
      expect(extractPickedSpreadsheetId(payload)).toBeNull()
    })
  })
})
