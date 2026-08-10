import {
  Button,
  ButtonProps,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Stack,
  Text,
} from '@chakra-ui/react'
import { ChevronLeftIcon, PlusIcon, TrashIcon } from '@/components/icons'
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { trpc } from '@/lib/trpc'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { useEditor } from '@/features/editor/providers/EditorProvider'
import { ForgedBlockDefinition } from '@typebot.io/forge-repository/types'
import { useToast } from '@/hooks/useToast'
import {
  CredentialInUseModal,
  type CredentialUsage,
} from '@/features/credentials/components/CredentialInUseModal'

type Props = Omit<ButtonProps, 'type'> & {
  blockDef: ForgedBlockDefinition
  currentCredentialsId: string | undefined
  onAddClick: () => void
  onCredentialsSelect: (credentialId?: string) => void
}

export const ForgedCredentialsDropdown = ({
  currentCredentialsId,
  blockDef,
  onCredentialsSelect,
  onAddClick,
  ...props
}: Props) => {
  const router = useRouter()
  const { showToast } = useToast()
  const { workspace, currentRole } = useWorkspace()
  const { typebot } = useTypebot()
  const { revalidate } = useEditor()
  const { data, refetch, isLoading } = trpc.forge.listCredentials.useQuery(
    {
      workspaceId: workspace?.id as string,
      type: blockDef.id,
    },
    { enabled: !!workspace?.id }
  )
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
        onCredentialsSelect(undefined)
      } else {
        revalidate?.()
      }
    },
    onSettled: () => {
      setIsDeleting(undefined)
      setIsForceDeleting(false)
    },
  })

  const currentCredential = data?.credentials.find(
    (c) => c.id === currentCredentialsId
  )

  const handleMenuItemClick = useCallback(
    (credentialsId: string) => () => {
      onCredentialsSelect(credentialsId)
    },
    [onCredentialsSelect]
  )

  const clearQueryParams = useCallback(() => {
    const hasQueryParams = router.asPath.includes('?')
    if (hasQueryParams)
      router.push(router.asPath.split('?')[0], undefined, { shallow: true })
  }, [router])

  useEffect(() => {
    if (!router.isReady) return
    if (router.query.credentialsId) {
      handleMenuItemClick(router.query.credentialsId.toString())()
      clearQueryParams()
    }
  }, [
    clearQueryParams,
    handleMenuItemClick,
    router.isReady,
    router.query.credentialsId,
  ])

  const deleteCredentials =
    (credentialsId: string) => async (e: React.MouseEvent) => {
      if (!workspace) return
      e.stopPropagation()
      mutate({
        workspaceId: workspace.id,
        credentialsId,
        currentTypebotId: typebot?.id,
      })
    }

  if (!data || data?.credentials.length === 0) {
    return (
      <Button
        colorScheme="gray"
        textAlign="left"
        leftIcon={<PlusIcon />}
        onClick={onAddClick}
        isDisabled={currentRole === 'GUEST'}
        isLoading={isLoading}
        {...props}
      >
        Add {blockDef.auth?.name}
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
              : `Select ${blockDef.auth?.name}`}
          </Text>
        </MenuButton>
        <MenuList>
          <Stack maxH={'35vh'} overflowY="auto" spacing="0">
            {data?.credentials.map((credentials) => (
              <MenuItem
                role="menuitem"
                minH="40px"
                key={credentials.id}
                onClick={handleMenuItemClick(credentials.id)}
                fontSize="16px"
                fontWeight="normal"
                rounded="none"
                justifyContent="space-between"
              >
                {credentials.name}
                <IconButton
                  icon={<TrashIcon />}
                  aria-label="Remove credentials"
                  size="xs"
                  onClick={deleteCredentials(credentials.id)}
                  isLoading={isDeleting === credentials.id}
                />
              </MenuItem>
            ))}
            {currentRole === 'GUEST' ? null : (
              <MenuItem
                maxW="500px"
                overflow="hidden"
                whiteSpace="nowrap"
                textOverflow="ellipsis"
                icon={<PlusIcon />}
                onClick={onAddClick}
              >
                Connect new
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
          inUseModalState && workspace
            ? () =>
                mutate({
                  workspaceId: workspace.id,
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
