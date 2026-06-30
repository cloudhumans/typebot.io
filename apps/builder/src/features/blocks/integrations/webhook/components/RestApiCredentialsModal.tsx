import { TextInput } from '@/components/inputs/TextInput'
import { TableList } from '@/components/TableList'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { useTypebot } from '@/features/editor/providers/TypebotProvider'
import { useToast } from '@/hooks/useToast'
import { trpc } from '@/lib/trpc'
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  Stack,
  ModalFooter,
  Button,
  FormControl,
  FormLabel,
  Switch,
  Text,
  Center,
  Spinner,
  Flex,
  HStack,
  useColorModeValue,
} from '@chakra-ui/react'
import { KeyValue } from '@typebot.io/schemas'
import { isSafeBaseUrl } from '@typebot.io/schemas/features/blocks/integrations/webhook/urlHelpers'
import { createId } from '@paralleldrive/cuid2'
import React, { useEffect, useState } from 'react'
import { HeadersInputs, QueryParamsInputs } from './KeyValueInputs'
import { useTranslate } from '@tolgee/react'
import { MoreInfoTooltip } from '@/components/MoreInfoTooltip'
import { ShieldAlertIcon } from '@/components/icons'
import {
  CredentialInUseModal,
  type CredentialUsage,
} from '@/features/credentials/components/CredentialInUseModal'

type Props = {
  isOpen: boolean
  onClose: () => void
  onNewCredentials: (id: string) => void
  // Presence switches the modal to edit mode for the given credential.
  editingCredentialsId?: string
  onUpdated?: () => void
  onDeleted?: (credentialsId: string) => void
}

const toDataEntries = (items: KeyValue[]) =>
  items
    .map((item) => ({ key: (item.key ?? '').trim(), value: item.value ?? '' }))
    .filter((item) => item.key.length > 0)

export const RestApiCredentialsModal = ({
  isOpen,
  onClose,
  onNewCredentials,
  editingCredentialsId,
  onUpdated,
  onDeleted,
}: Props) => {
  const { t } = useTranslate()
  const { workspace } = useWorkspace()
  const { typebot } = useTypebot()
  const { showToast } = useToast()
  const isEditing = !!editingCredentialsId
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [headers, setHeaders] = useState<KeyValue[]>([])
  const [queryParams, setQueryParams] = useState<KeyValue[]>([])
  const [deprecated, setDeprecated] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  // Bumped on every open and whenever the loaded credential arrives, so the
  // uncontrolled inputs / TableLists remount and pick up the prefilled values.
  const [formEpoch, setFormEpoch] = useState(0)
  const [inUseModalState, setInUseModalState] = useState<{
    variant: 'delete' | 'save'
    usages: CredentialUsage[]
  } | null>(null)

  const trpcContext = trpc.useContext()
  const refetchCredentials = () =>
    trpcContext.credentials.listCredentials.refetch()

  const { data: editingData, isLoading: isLoadingCredential } =
    trpc.credentials.getRestApiCredential.useQuery(
      {
        workspaceId: workspace?.id as string,
        credentialsId: editingCredentialsId as string,
      },
      { enabled: isOpen && isEditing && !!workspace?.id }
    )

  // Re-derive the form on every open (not just when editingData's reference
  // changes) so reopening the same credential re-prefills even when react-query
  // serves a structurally-shared, same-reference cache hit. Secret values arrive
  // as the mask sentinel; a row left untouched is preserved server-side.
  useEffect(() => {
    if (!isOpen) return
    setFormEpoch((e) => e + 1)
    if (!isEditing) {
      setName('')
      setBaseUrl('')
      setHeaders([])
      setQueryParams([])
      setDeprecated(false)
      return
    }
    if (!editingData) return
    setName(editingData.name)
    setBaseUrl(editingData.baseUrl)
    // TableList rows need a stable id; the masked credential arrives without one.
    setHeaders(editingData.headers.map((h) => ({ id: createId(), ...h })))
    setQueryParams(
      editingData.queryParams.map((q) => ({ id: createId(), ...q }))
    )
    setDeprecated(editingData.deprecatedAt !== null)
  }, [isOpen, isEditing, editingData])

  const resetForm = () => {
    setName('')
    setBaseUrl('')
    setHeaders([])
    setQueryParams([])
    setDeprecated(false)
    setInUseModalState(null)
  }

  // Reset on close so reopening the modal (X / overlay click / Esc) doesn't show
  // stale name/baseUrl/headers from a previous, abandoned attempt.
  const handleClose = () => {
    resetForm()
    onClose()
  }

  const createMutation = trpc.credentials.createCredentials.useMutation({
    onMutate: () => setIsSaving(true),
    onSettled: () => setIsSaving(false),
    onError: (err) => showToast({ description: err.message, status: 'error' }),
    onSuccess: (data) => {
      refetchCredentials()
      onNewCredentials(data.credentialsId)
      handleClose()
    },
  })

  const updateMutation = trpc.credentials.updateCredentials.useMutation({
    onMutate: () => setIsSaving(true),
    onSettled: () => setIsSaving(false),
    onError: (error) => {
      const usages = (error.data as { usages?: CredentialUsage[] } | null)
        ?.usages
      if (error.data?.code === 'PRECONDITION_FAILED' && usages) {
        setInUseModalState({ variant: 'save', usages })
        return
      }
      showToast({ description: error.message, status: 'error' })
    },
    onSuccess: () => {
      refetchCredentials()
      if (editingCredentialsId)
        trpcContext.credentials.getRestApiCredential.invalidate({
          workspaceId: workspace?.id as string,
          credentialsId: editingCredentialsId,
        })
      onUpdated?.()
      handleClose()
    },
  })

  const deleteMutation = trpc.credentials.deleteCredentials.useMutation({
    onMutate: () => setIsDeleting(true),
    onSettled: () => setIsDeleting(false),
    onError: (error) => {
      const usages = (error.data as { usages?: CredentialUsage[] } | null)
        ?.usages
      if (error.data?.code === 'PRECONDITION_FAILED' && usages) {
        setInUseModalState({ variant: 'delete', usages })
        return
      }
      showToast({ description: error.message, status: 'error' })
    },
    onSuccess: ({ credentialsId }) => {
      refetchCredentials()
      onDeleted?.(credentialsId)
      handleClose()
    },
  })

  const iconBg = useColorModeValue('orange.100', 'orange.900')
  const iconColor = useColorModeValue('orange.500', 'orange.300')

  const isBaseUrlInvalid = baseUrl.trim() !== '' && !isSafeBaseUrl(baseUrl)

  const buildData = () => ({
    baseUrl: baseUrl.trim(),
    headers: toDataEntries(headers),
    queryParams: toDataEntries(queryParams),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspace) return
    if (!isSafeBaseUrl(baseUrl)) {
      showToast({
        description: t(
          'blocks.integrations.httpRequest.credentialsModal.invalidBaseUrl'
        ),
        status: 'error',
      })
      return
    }
    const data = buildData()
    if (isEditing) {
      updateMutation.mutate({
        credentialsId: editingCredentialsId as string,
        workspaceId: workspace.id,
        name,
        data,
        deprecated,
      })
      return
    }
    createMutation.mutate({
      credentials: { type: 'rest-api', workspaceId: workspace.id, name, data },
    })
  }

  const confirmInUseAction = () => {
    if (!workspace || !editingCredentialsId || !inUseModalState) return
    if (inUseModalState.variant === 'delete') {
      deleteMutation.mutate({
        workspaceId: workspace.id,
        credentialsId: editingCredentialsId,
        force: true,
        currentTypebotId: typebot?.id,
      })
      return
    }
    updateMutation.mutate({
      credentialsId: editingCredentialsId,
      workspaceId: workspace.id,
      name,
      data: buildData(),
      deprecated,
      confirmed: true,
    })
  }

  const handleDelete = async () => {
    if (!workspace || !editingCredentialsId) return
    setIsDeleting(true)
    try {
      // Read-only pre-check so an in-use credential opens the modal without a
      // failed delete (412) in the console. Mirrors deleteCredentials' guard:
      // a usage only from the current flow's draft block doesn't block.
      const { usages } =
        await trpcContext.credentials.getCredentialsUsages.fetch({
          workspaceId: workspace.id,
          credentialsId: editingCredentialsId,
        })
      const blockingUsages = usages.filter(
        (u) =>
          !(
            u.source === 'Typebot' &&
            u.via === 'block' &&
            u.typebotId === typebot?.id
          )
      )
      if (blockingUsages.length > 0) {
        setIsDeleting(false)
        setInUseModalState({ variant: 'delete', usages: blockingUsages })
        return
      }
      // No blocking usage now: delete. The mutation re-checks atomically, so a
      // usage that appears between this check and the delete still 412s and
      // re-opens the modal via onError (keeping the user in the delete flow).
      deleteMutation.mutate({
        workspaceId: workspace.id,
        credentialsId: editingCredentialsId,
        currentTypebotId: typebot?.id,
      })
    } catch (error) {
      setIsDeleting(false)
      showToast({ description: (error as Error).message, status: 'error' })
    }
  }

  const showLoader = isEditing && isLoadingCredential
  // Remount inputs/tables on each open and once edit data is loaded so
  // defaultValue/initialItems pick up the freshly prefilled values.
  const formKey = `${editingCredentialsId ?? 'new'}-${formEpoch}`

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack spacing={3}>
            <Flex
              flexShrink={0}
              boxSize="40px"
              borderRadius="lg"
              bg={iconBg}
              color={iconColor}
              align="center"
              justify="center"
            >
              <ShieldAlertIcon boxSize="20px" />
            </Flex>
            <Text>
              {t(
                isEditing
                  ? 'blocks.integrations.httpRequest.credentialsModal.editTitle'
                  : 'blocks.integrations.httpRequest.credentialsModal.title'
              )}
            </Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <form onSubmit={submit}>
          <ModalBody as={Stack} spacing="6">
            {showLoader ? (
              <Center py="10">
                <Spinner />
              </Center>
            ) : (
              <>
                <TextInput
                  key={`name-${formKey}`}
                  isRequired
                  label={t(
                    'blocks.integrations.httpRequest.credentialsModal.nameInput.label'
                  )}
                  defaultValue={name}
                  onChange={setName}
                  placeholder={t(
                    'blocks.integrations.httpRequest.credentialsModal.nameInput.placeholder'
                  )}
                  withVariableButton={false}
                  debounceTimeout={0}
                />
                <Stack spacing={1}>
                  <TextInput
                    key={`baseUrl-${formKey}`}
                    isRequired
                    label={t(
                      'blocks.integrations.httpRequest.credentialsModal.baseUrlInput.label'
                    )}
                    defaultValue={baseUrl}
                    onChange={setBaseUrl}
                    placeholder={t(
                      'blocks.integrations.httpRequest.credentialsModal.baseUrlInput.placeholder'
                    )}
                    helperText={t(
                      'blocks.integrations.httpRequest.credentialsModal.baseUrlInput.helperText'
                    )}
                    withVariableButton={false}
                    debounceTimeout={0}
                  />
                  {isBaseUrlInvalid && (
                    <Text fontSize="sm" color="red.500">
                      {t(
                        'blocks.integrations.httpRequest.credentialsModal.invalidBaseUrl'
                      )}
                    </Text>
                  )}
                </Stack>
                <Stack>
                  <FormLabel mb="0">
                    {t(
                      'blocks.integrations.httpRequest.credentialsModal.queryParams.label'
                    )}{' '}
                    <MoreInfoTooltip>
                      {t(
                        'blocks.integrations.httpRequest.credentialsModal.maskedHint'
                      )}
                      {isEditing &&
                        ` ${t(
                          'blocks.integrations.httpRequest.credentialsModal.editSecretHint'
                        )}`}
                    </MoreInfoTooltip>
                  </FormLabel>
                  <TableList<KeyValue>
                    key={`queryParams-${formKey}`}
                    initialItems={queryParams}
                    onItemsChange={setQueryParams}
                    addLabel={t(
                      'blocks.integrations.httpRequest.credentialsModal.addParam.label'
                    )}
                  >
                    {(props) => <QueryParamsInputs {...props} />}
                  </TableList>
                </Stack>
                <Stack>
                  <FormLabel mb="0">
                    {t(
                      'blocks.integrations.httpRequest.credentialsModal.headers.label'
                    )}{' '}
                    <MoreInfoTooltip>
                      {t(
                        'blocks.integrations.httpRequest.credentialsModal.maskedHint'
                      )}
                      {isEditing &&
                        ` ${t(
                          'blocks.integrations.httpRequest.credentialsModal.editSecretHint'
                        )}`}
                    </MoreInfoTooltip>
                  </FormLabel>
                  <TableList<KeyValue>
                    key={`headers-${formKey}`}
                    initialItems={headers}
                    onItemsChange={setHeaders}
                    addLabel={t(
                      'blocks.integrations.httpRequest.credentialsModal.addHeader.label'
                    )}
                  >
                    {(props) => <HeadersInputs {...props} />}
                  </TableList>
                </Stack>
                {isEditing && (
                  <FormControl as={HStack} justifyContent="space-between">
                    <FormLabel mb="0">
                      {t(
                        'blocks.integrations.httpRequest.credentialsModal.deprecateToggle.label'
                      )}
                      &nbsp;
                      <MoreInfoTooltip>
                        {t(
                          'blocks.integrations.httpRequest.credentialsModal.deprecateToggle.sub'
                        )}
                      </MoreInfoTooltip>
                    </FormLabel>
                    <Switch
                      isChecked={deprecated}
                      onChange={(e) => setDeprecated(e.target.checked)}
                    />
                  </FormControl>
                )}
              </>
            )}
          </ModalBody>
          <ModalFooter
            justifyContent={isEditing ? 'space-between' : 'flex-end'}
          >
            {isEditing && (
              <Button
                variant="outline"
                colorScheme="red"
                isLoading={isDeleting}
                isDisabled={showLoader}
                onClick={handleDelete}
              >
                {t(
                  'blocks.integrations.httpRequest.credentialsModal.deleteButton.label'
                )}
              </Button>
            )}
            <Button
              type="submit"
              isLoading={isSaving}
              isDisabled={
                showLoader || name === '' || baseUrl === '' || isBaseUrlInvalid
              }
              colorScheme="blue"
            >
              {t(
                isEditing
                  ? 'blocks.integrations.httpRequest.credentialsModal.saveButton.label'
                  : 'blocks.integrations.httpRequest.credentialsModal.createButton.label'
              )}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
      <CredentialInUseModal
        isOpen={inUseModalState !== null}
        onClose={() => setInUseModalState(null)}
        usages={inUseModalState?.usages ?? []}
        credentialName={name}
        variant={inUseModalState?.variant}
        onForceDelete={confirmInUseAction}
        isForceDeleting={isDeleting || isSaving}
      />
    </Modal>
  )
}
