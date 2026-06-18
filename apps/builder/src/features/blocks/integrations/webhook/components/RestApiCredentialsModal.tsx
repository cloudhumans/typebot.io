import { TextInput } from '@/components/inputs/TextInput'
import { TableList } from '@/components/TableList'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
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
} from '@chakra-ui/react'
import { KeyValue } from '@typebot.io/schemas'
import { isSafeBaseUrl } from '@typebot.io/schemas/features/blocks/integrations/webhook/urlHelpers'
import React, { useState } from 'react'
import { HeadersInputs, QueryParamsInputs } from './KeyValueInputs'
import { useTranslate } from '@tolgee/react'

type Props = {
  isOpen: boolean
  onClose: () => void
  onNewCredentials: (id: string) => void
}

const toDataEntries = (items: KeyValue[]) =>
  items
    .map((item) => ({ key: (item.key ?? '').trim(), value: item.value ?? '' }))
    .filter((item) => item.key.length > 0)

export const RestApiCredentialsModal = ({
  isOpen,
  onClose,
  onNewCredentials,
}: Props) => {
  const { t } = useTranslate()
  const { workspace } = useWorkspace()
  const { showToast } = useToast()
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [headers, setHeaders] = useState<KeyValue[]>([])
  const [queryParams, setQueryParams] = useState<KeyValue[]>([])
  const [isCreating, setIsCreating] = useState(false)

  const {
    credentials: {
      listCredentials: { refetch: refetchCredentials },
    },
  } = trpc.useContext()
  const { mutate } = trpc.credentials.createCredentials.useMutation({
    onMutate: () => setIsCreating(true),
    onSettled: () => setIsCreating(false),
    onError: (err) => {
      showToast({ description: err.message, status: 'error' })
    },
    onSuccess: (data) => {
      refetchCredentials()
      onNewCredentials(data.credentialsId)
      resetForm()
      onClose()
    },
  })

  const resetForm = () => {
    setName('')
    setBaseUrl('')
    setHeaders([])
    setQueryParams([])
  }

  // Reset on close so reopening the modal (X / overlay click / Esc) doesn't show
  // stale name/baseUrl/headers from a previous, abandoned attempt.
  const handleClose = () => {
    resetForm()
    onClose()
  }

  const isBaseUrlInvalid = baseUrl.trim() !== '' && !isSafeBaseUrl(baseUrl)

  const createRestApiCredentials = async (e: React.FormEvent) => {
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
    mutate({
      credentials: {
        type: 'rest-api',
        workspaceId: workspace.id,
        name,
        data: {
          baseUrl: baseUrl.trim(),
          headers: toDataEntries(headers),
          queryParams: toDataEntries(queryParams),
        },
      },
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          {t('blocks.integrations.httpRequest.credentialsModal.title')}
        </ModalHeader>
        <ModalCloseButton />
        <form onSubmit={createRestApiCredentials}>
          <ModalBody as={Stack} spacing="6">
            <TextInput
              isRequired
              label={t(
                'blocks.integrations.httpRequest.credentialsModal.nameInput.label'
              )}
              onChange={setName}
              placeholder={t(
                'blocks.integrations.httpRequest.credentialsModal.nameInput.placeholder'
              )}
              withVariableButton={false}
              debounceTimeout={0}
            />
            <Stack spacing={1}>
              <TextInput
                isRequired
                label={t(
                  'blocks.integrations.httpRequest.credentialsModal.baseUrlInput.label'
                )}
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
                  'blocks.integrations.httpRequest.credentialsModal.headers.label'
                )}{' '}
                <Text as="span" color="gray.500" fontWeight="normal">
                  {t(
                    'blocks.integrations.httpRequest.credentialsModal.maskedHint'
                  )}
                </Text>
              </FormLabel>
              <TableList<KeyValue>
                initialItems={headers}
                onItemsChange={setHeaders}
                addLabel={t(
                  'blocks.integrations.httpRequest.credentialsModal.addHeader.label'
                )}
              >
                {(props) => <HeadersInputs {...props} />}
              </TableList>
            </Stack>
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
                initialItems={queryParams}
                onItemsChange={setQueryParams}
                addLabel={t(
                  'blocks.integrations.httpRequest.credentialsModal.addParam.label'
                )}
              >
                {(props) => <QueryParamsInputs {...props} />}
              </TableList>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button
              type="submit"
              isLoading={isCreating}
              isDisabled={name === '' || baseUrl === '' || isBaseUrlInvalid}
              colorScheme="blue"
            >
              {t(
                'blocks.integrations.httpRequest.credentialsModal.createButton.label'
              )}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  )
}
