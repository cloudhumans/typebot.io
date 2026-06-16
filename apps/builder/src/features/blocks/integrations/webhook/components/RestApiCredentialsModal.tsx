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
import React, { useState } from 'react'
import { HeadersInputs, QueryParamsInputs } from './KeyValueInputs'

type Props = {
  isOpen: boolean
  onClose: () => void
  onNewCredentials: (id: string) => void
}

const isValidUrl = (url: string) => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const toDataEntries = (items: KeyValue[]) =>
  items
    .filter((item) => item.key && item.key.length > 0)
    .map((item) => ({ key: item.key as string, value: item.value ?? '' }))

export const RestApiCredentialsModal = ({
  isOpen,
  onClose,
  onNewCredentials,
}: Props) => {
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

  const createRestApiCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspace) return
    if (!isValidUrl(baseUrl)) {
      showToast({
        description: 'The configured Base URL must be a valid http(s) URL.',
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
          baseUrl,
          headers: toDataEntries(headers),
          queryParams: toDataEntries(queryParams),
        },
      },
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Add REST API credentials</ModalHeader>
        <ModalCloseButton />
        <form onSubmit={createRestApiCredentials}>
          <ModalBody as={Stack} spacing="6">
            <TextInput
              isRequired
              label="Name"
              onChange={setName}
              placeholder="My API"
              withVariableButton={false}
              debounceTimeout={0}
            />
            <TextInput
              isRequired
              label="Base URL"
              onChange={setBaseUrl}
              placeholder="https://api.example.com/v1"
              helperText="Requests inherit this base URL. The block only sets the path suffix."
              withVariableButton={false}
              debounceTimeout={0}
            />
            <Stack>
              <FormLabel mb="0">
                Headers{' '}
                <Text as="span" color="gray.500" fontWeight="normal">
                  (values are stored encrypted and masked)
                </Text>
              </FormLabel>
              <TableList<KeyValue>
                initialItems={headers}
                onItemsChange={setHeaders}
                addLabel="Add a header"
              >
                {(props) => <HeadersInputs {...props} />}
              </TableList>
            </Stack>
            <Stack>
              <FormLabel mb="0">
                Query params{' '}
                <Text as="span" color="gray.500" fontWeight="normal">
                  (values are stored encrypted and masked)
                </Text>
              </FormLabel>
              <TableList<KeyValue>
                initialItems={queryParams}
                onItemsChange={setQueryParams}
                addLabel="Add a param"
              >
                {(props) => <QueryParamsInputs {...props} />}
              </TableList>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button
              type="submit"
              isLoading={isCreating}
              isDisabled={name === '' || baseUrl === ''}
              colorScheme="blue"
            >
              Create
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  )
}
