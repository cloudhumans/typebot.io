import { MenuList, MenuItem } from '@chakra-ui/react'
import { CopyIcon, TrashIcon } from '@/components/icons'
import { useTranslate } from '@tolgee/react'

type Props = {
  onDuplicateClick: () => void
  onDeleteClick: () => void
  isDeletable?: boolean
}

export const GroupNodeContextMenu = ({
  onDuplicateClick,
  onDeleteClick,
  isDeletable = true,
}: Props) => {
  const { t } = useTranslate()

  return (
    <MenuList>
      <MenuItem icon={<CopyIcon />} onClick={onDuplicateClick}>
        {t('copy')}
      </MenuItem>
      {isDeletable && (
        <MenuItem icon={<TrashIcon />} onClick={onDeleteClick}>
          {t('delete')}
        </MenuItem>
      )}
    </MenuList>
  )
}
