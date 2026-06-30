import {
  Badge,
  Button,
  ButtonProps,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Stack,
  Text,
} from '@chakra-ui/react'
import {
  ChevronLeftIcon,
  EditIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons'
import React, { useCallback, useState } from 'react'
import { useToast } from '../../../hooks/useToast'
import { Credentials } from '@typebot.io/schemas'
import { trpc } from '@/lib/trpc'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { useEditor } from '@/features/editor/providers/EditorProvider'
import { useTranslate } from '@tolgee/react'
import {
  CredentialInUseModal,
  type CredentialUsage,
} from './CredentialInUseModal'

type Props = Omit<ButtonProps, 'type'> & {
  type: Credentials['type']
  workspaceId: string
  currentCredentialsId?: string
  onCredentialsSelect: (credentialId?: string) => void
  onCreateNewClick: () => void
  // When provided, each row shows an edit (pencil) action instead of the inline
  // delete (trash). Deletion then lives inside the edit flow. Used by rest-api,
  // where the full credential lifecycle is managed in the edit modal.
  onEditClick?: (credentialsId: string) => void
  defaultCredentialLabel?: string
  credentialsName: string
}

export const CredentialsDropdown = ({
  type,
  workspaceId,
  currentCredentialsId,
  onCredentialsSelect,
  onCreateNewClick,
  onEditClick,
  defaultCredentialLabel,
  credentialsName,
  ...props
}: Props) => {
  const { t } = useTranslate()
  const { showToast } = useToast()
  const { currentRole } = useWorkspace()
  const { typebot } = useTypebot()
  const { revalidate } = useEditor()
  const { data, refetch } = trpc.credentials.listCredentials.useQuery({
    workspaceId,
    type,
  })
  const [isDeleting, setIsDeleting] = useState<string>()
  const [isForceDeleting, setIsForceDeleting] = useState(false)
  const [inUseModalState, setInUseModalState] = useState<{
    credentialsId: string
    credentialName?: string
    usages: CredentialUsage[]
  } | null>(null)

  const { mutate } = trpc.credentials.deleteCredentials.useMutation({
    onMutate: ({ credentialsId, force }) => {
      setIsDeleting(credentialsId)
      if (force) setIsForceDeleting(true)
    },
    onError: (error, variables) => {
      const usages = (error.data as { usages?: CredentialUsage[] } | null)
        ?.usages
      if (error.data?.code === 'PRECONDITION_FAILED' && usages) {
        const credentialName = data?.credentials.find(
          (c) => c.id === variables.credentialsId
        )?.name
        setInUseModalState({
          credentialsId: variables.credentialsId,
          credentialName,
          usages,
        })
        return
      }
      showToast({
        description: error.message,
      })
    },
    onSuccess: ({ credentialsId }) => {
      setInUseModalState(null)
      refetch()
      if (credentialsId === currentCredentialsId) {
        // Clearing this block's credentialsId is a content change; the
        // content-keyed validation effect re-runs with the fresh state.
        onCredentialsSelect(undefined)
      } else {
        // No content change for this flow, so force a revalidation to surface
        // other blocks of this flow that still reference the deleted credential.
        revalidate?.()
      }
    },
    onSettled: () => {
      setIsDeleting(undefined)
      setIsForceDeleting(false)
    },
  })

  const defaultCredentialsLabel =
    defaultCredentialLabel ?? `${t('select')} ${credentialsName}`

  const currentCredential = data?.credentials.find(
    (c) => c.id === currentCredentialsId
  )

  const handleMenuItemClick = useCallback(
    (credentialsId: string) => () => {
      onCredentialsSelect(credentialsId)
    },
    [onCredentialsSelect]
  )

  const deleteCredentials =
    (credentialsId: string) => async (e: React.MouseEvent) => {
      e.stopPropagation()
      mutate({ workspaceId, credentialsId, currentTypebotId: typebot?.id })
    }

  const editCredentials = (credentialsId: string) => (e: React.MouseEvent) => {
    e.stopPropagation()
    onEditClick?.(credentialsId)
  }

  // Deprecated credentials still resolve, so they stay selectable (you may need
  // to re-point a block at one), but sink to the bottom of the list.
  const sortedCredentials = [...(data?.credentials ?? [])].sort((a, b) => {
    const aDep = a.deprecatedAt ? 1 : 0
    const bDep = b.deprecatedAt ? 1 : 0
    return aDep - bDep
  })

  if (data?.credentials.length === 0 && !defaultCredentialLabel) {
    return (
      <Button
        colorScheme="gray"
        textAlign="left"
        leftIcon={<PlusIcon />}
        onClick={onCreateNewClick}
        isDisabled={currentRole === 'GUEST'}
        {...props}
      >
        {t('add')} {credentialsName}
      </Button>
    )
  }
  return (
    <>
      <Menu isLazy>
        <MenuButton
          as={Button}
          rightIcon={<ChevronLeftIcon transform={'rotate(-90deg)'} />}
          colorScheme="gray"
          justifyContent="space-between"
          textAlign="left"
          {...props}
        >
          <Text
            noOfLines={1}
            overflowY="visible"
            h={props.size === 'sm' ? '18px' : '20px'}
          >
            {currentCredential
              ? currentCredential.name
              : defaultCredentialsLabel}
          </Text>
        </MenuButton>
        <MenuList>
          <Stack maxH={'35vh'} overflowY="auto" spacing="0">
            {defaultCredentialLabel && (
              <MenuItem
                maxW="500px"
                overflow="hidden"
                whiteSpace="nowrap"
                textOverflow="ellipsis"
                onClick={handleMenuItemClick('default')}
              >
                {defaultCredentialLabel}
              </MenuItem>
            )}
            {sortedCredentials.map((credentials) => (
              <MenuItem
                as="div"
                role="menuitem"
                minH="40px"
                key={credentials.id}
                onClick={handleMenuItemClick(credentials.id)}
                fontSize="16px"
                fontWeight="normal"
                rounded="none"
                justifyContent="space-between"
                gap="3"
              >
                <HStack spacing="2" overflow="hidden">
                  <Text
                    noOfLines={1}
                    color={credentials.deprecatedAt ? 'gray.500' : undefined}
                  >
                    {credentials.name}
                  </Text>
                  {credentials.deprecatedAt && (
                    <Badge
                      colorScheme="orange"
                      fontSize="2xs"
                      flexShrink={0}
                      textTransform="uppercase"
                    >
                      {t('credentials.deprecatedBadge')}
                    </Badge>
                  )}
                </HStack>
                {onEditClick ? (
                  <IconButton
                    icon={<EditIcon />}
                    aria-label={t('credentials.editCredentials.label')}
                    size="xs"
                    onClick={editCredentials(credentials.id)}
                  />
                ) : (
                  <IconButton
                    icon={<TrashIcon />}
                    aria-label={t(
                      'blocks.inputs.payment.settings.credentials.removeCredentials.label'
                    )}
                    size="xs"
                    onClick={deleteCredentials(credentials.id)}
                    isLoading={isDeleting === credentials.id}
                  />
                )}
              </MenuItem>
            ))}
            {currentRole === 'GUEST' ? null : (
              <MenuItem
                maxW="500px"
                overflow="hidden"
                whiteSpace="nowrap"
                textOverflow="ellipsis"
                icon={<PlusIcon />}
                onClick={onCreateNewClick}
              >
                {t(
                  'blocks.inputs.payment.settings.credentials.connectNew.label'
                )}
              </MenuItem>
            )}
          </Stack>
        </MenuList>
      </Menu>
      <CredentialInUseModal
        isOpen={inUseModalState !== null}
        onClose={() => setInUseModalState(null)}
        usages={inUseModalState?.usages ?? []}
        credentialName={inUseModalState?.credentialName}
        onForceDelete={
          inUseModalState
            ? () =>
                mutate({
                  workspaceId,
                  credentialsId: inUseModalState.credentialsId,
                  force: true,
                  currentTypebotId: typebot?.id,
                })
            : undefined
        }
        isForceDeleting={isForceDeleting}
      />
    </>
  )
}
