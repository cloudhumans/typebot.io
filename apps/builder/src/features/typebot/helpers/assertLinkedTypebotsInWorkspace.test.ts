import { vi, describe, it, expect, beforeEach } from 'vitest'
import prisma from '@typebot.io/lib/prisma'
import { LogicBlockType } from '@typebot.io/schemas/features/blocks/logic/constants'
import { assertLinkedTypebotsInWorkspace } from './assertLinkedTypebotsInWorkspace'

vi.mock('@typebot.io/lib/prisma', () => ({
  default: {
    typebot: {
      findUnique: vi.fn(),
    },
  },
}))

const link = (typebotId: string) => ({
  id: `link-${typebotId}`,
  type: LogicBlockType.TYPEBOT_LINK,
  options: { typebotId },
})

const groupsWith = (...blocks: object[]) => [{ id: 'g1', title: 'G', blocks }]

const row = (id: string, workspaceId: string, groups: object[] = []) => ({
  id,
  workspaceId,
  groups,
})

const rows = (...typebots: ReturnType<typeof row>[]) => {
  vi.mocked(prisma.typebot.findUnique).mockImplementation(
    (async ({ where }: { where: { id: string } }) =>
      typebots.find((t) => t.id === where.id) ?? null) as never
  )
}

const run = (groups: object[]) =>
  assertLinkedTypebotsInWorkspace({
    rootId: 'root',
    workspaceId: 'ws-1',
    groups: groups as never,
  })

describe('assertLinkedTypebotsInWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rows()
  })

  it('resolves without querying when there are no link blocks', async () => {
    await expect(
      run(groupsWith({ id: 'b1', type: 'Text', options: {} }))
    ).resolves.toBeUndefined()
    expect(prisma.typebot.findUnique).not.toHaveBeenCalled()
  })

  it('ignores links to "current" and to the root itself', async () => {
    await expect(
      run(groupsWith(link('current'), link('root')))
    ).resolves.toBeUndefined()
    expect(prisma.typebot.findUnique).not.toHaveBeenCalled()
  })

  it('resolves for a link to a typebot in the same workspace, querying it once', async () => {
    rows(row('b', 'ws-1'))

    await expect(run(groupsWith(link('b')))).resolves.toBeUndefined()
    expect(prisma.typebot.findUnique).toHaveBeenCalledTimes(1)
    expect(prisma.typebot.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b' } })
    )
  })

  it('rejects a link to a typebot in another workspace', async () => {
    rows(row('b', 'ws-2'))

    await expect(run(groupsWith(link('b')))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('another workspace'),
    })
  })

  it('rejects a link to a typebot that does not exist', async () => {
    await expect(run(groupsWith(link('ghost')))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('does not exist'),
    })
  })

  it('rejects a chain whose deeper link leaves the workspace', async () => {
    rows(row('b', 'ws-1', groupsWith(link('c'))), row('c', 'ws-2'))

    await expect(run(groupsWith(link('b')))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining('another workspace'),
    })
  })

  it('terminates on cycles back to the root and to itself', async () => {
    rows(row('b', 'ws-1', groupsWith(link('root'), link('b'))))

    await expect(run(groupsWith(link('b')))).resolves.toBeUndefined()
    expect(prisma.typebot.findUnique).toHaveBeenCalledTimes(1)
  })
})
