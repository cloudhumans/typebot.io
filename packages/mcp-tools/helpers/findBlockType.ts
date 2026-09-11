type BlockLike = { id: string; type: string }
type GroupLike = { blocks: BlockLike[] }

export const findBlockType = (
  typebot: { groups: GroupLike[] },
  blockId: string | undefined
): string | undefined => {
  if (!blockId) return undefined
  for (const group of typebot.groups) {
    const block = group.blocks.find((candidate) => candidate.id === blockId)
    if (block) return block.type
  }
  return undefined
}
