import { describe, expect, it } from 'vitest'
import { parseSpreadsheetId } from './parseSpreadsheetId'

const id = '14kFHPRHb9_lXkbVHxhY4obaxWwghaZjobqB3TrAqX1Y'

describe('parseSpreadsheetId', () => {
  it('accepts a bare spreadsheet id', () => {
    expect(parseSpreadsheetId(id)).toBe(id)
  })

  it('trims surrounding whitespace', () => {
    expect(parseSpreadsheetId(`  ${id}\n`)).toBe(id)
  })

  it('extracts the id from an edit link', () => {
    expect(
      parseSpreadsheetId(
        `https://docs.google.com/spreadsheets/d/${id}/edit?gid=1063004136#gid=1063004136`
      )
    ).toBe(id)
  })

  it('extracts the id from a link without a trailing path', () => {
    expect(
      parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${id}`)
    ).toBe(id)
  })

  it('extracts the id from a multi-account link', () => {
    expect(
      parseSpreadsheetId(
        `https://docs.google.com/spreadsheets/u/1/d/${id}/edit#gid=0`
      )
    ).toBe(id)
  })

  it('rejects empty input', () => {
    expect(parseSpreadsheetId('   ')).toBeNull()
  })

  it('rejects links that are not spreadsheets', () => {
    expect(
      parseSpreadsheetId(`https://docs.google.com/document/d/${id}/edit`)
    ).toBeNull()
  })

  it('rejects arbitrary text', () => {
    expect(parseSpreadsheetId('minha planilha')).toBeNull()
  })

  it('rejects ids that are too short to be real', () => {
    expect(
      parseSpreadsheetId('https://docs.google.com/spreadsheets/d/abc/edit')
    ).toBeNull()
  })
})
