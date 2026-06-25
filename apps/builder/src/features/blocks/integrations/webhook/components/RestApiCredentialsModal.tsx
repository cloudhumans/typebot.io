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
  FormLabel,
  Text,
  Center,
  Spinner,
  HStack,
  Switch,
} from '@chakra-ui/react'
import { KeyValue } from '@typebot.io/schemas'
import { isSafeBaseUrl } from '@typebot.io/schemas/features/blocks/integrations/webhook/urlHelpers'
import React, { useEffect, useState } from 'react'
import { HeadersInputs, QueryParamsInputs } from './KeyValueInputs'
import { useTranslate } from '@tolgee/react'
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
    setHeaders(editingData.headers)
    setQueryParams(editingData.queryParams)
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

  const isBaseUrlInvalid = baseUrl.trim() !== '' && !isSafeBaseUrl(baseUrl)

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
    const data = {
      baseUrl: baseUrl.trim(),
      headers: toDataEntries(headers),
      queryParams: toDataEntries(queryParams),
    }
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
      data: {
        baseUrl: baseUrl.trim(),
        headers: toDataEntries(headers),
        queryParams: toDataEntries(queryParams),
      },
      deprecated,
      confirmed: true,
    })
  }

  const handleDelete = () => {
    if (!workspace || !editingCredentialsId) return
    deleteMutation.mutate({
      workspaceId: workspace.id,
      credentialsId: editingCredentialsId,
      currentTypebotId: typebot?.id,
    })
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
          {t(
            isEditing
              ? 'blocks.integrations.httpRequest.credentialsModal.editTitle'
              : 'blocks.integrations.httpRequest.credentialsModal.title'
          )}
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
                {isEditing && (
                  <Text fontSize="sm" color="gray.500">
                    {t(
                      'blocks.integrations.httpRequest.credentialsModal.editSecretHint'
                    )}
                  </Text>
                )}
                <Stack>
                  <FormLabel mb="0">
                    {t(
                      'blocks.integrations.httpRequest.credentialsModal.queryParams.label'
                    )}{' '}
                    <Text as="span" color="gray.500" fontWeight="normal">
                      {t(
                        'blocks.integrations.httpRequest.credentialsModal.maskedHint'
                      )}
                    </Text>
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
                    <Text as="span" color="gray.500" fontWeight="normal">
                      {t(
                        'blocks.integrations.httpRequest.credentialsModal.maskedHint'
                      )}
                    </Text>
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
                  <HStack
                    justify="space-between"
                    p="3"
                    borderWidth="1px"
                    borderColor="orange.200"
                    bg="orange.50"
                    rounded="md"
                  >
                    <Stack spacing="0">
                      <Text fontWeight="medium" fontSize="sm">
                        {t(
                          'blocks.integrations.httpRequest.credentialsModal.deprecateToggle.label'
                        )}
                      </Text>
                      <Text fontSize="xs" color="gray.600">
                        {t(
                          'blocks.integrations.httpRequest.credentialsModal.deprecateToggle.sub'
                        )}
                      </Text>
                    </Stack>
                    <Switch
                      isChecked={deprecated}
                      onChange={(e) => setDeprecated(e.target.checked)}
                      colorScheme="orange"
                    />
                  </HStack>
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
