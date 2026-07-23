import {
  Button,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Text,
  Textarea,
  VStack,
  Alert,
  AlertIcon,
  useColorModeValue,
} from '@chakra-ui/react'
import { ToolIcon } from '@/components/icons'
import { Typebot } from '@typebot.io/schemas'
import { useTranslate } from '@tolgee/react'
import React, { useEffect, useState } from 'react'

type WorkspaceOption = {
  id: string
  name: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onSubmit: (typebot: Typebot, workspaceId: string) => void
  isLoading: boolean
  initialTenant?: string
  workspaces: WorkspaceOption[]
  currentWorkspaceId?: string
}

export const CreateToolModal = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  initialTenant,
  workspaces,
  currentWorkspaceId,
}: Props) => {
  const { t } = useTranslate()
  const [name, setName] = useState('')
  const [tenant, setTenant] = useState('')
  const [toolDescription, setToolDescription] = useState('')
  const [workspaceId, setWorkspaceId] = useState(currentWorkspaceId ?? '')

  const hasAutoSelectedRef = React.useRef(false)

  useEffect(() => {
    if (initialTenant) {
      setTenant(initialTenant)
    }
  }, [initialTenant])

  useEffect(() => {
    if (currentWorkspaceId && !workspaceId) {
      setWorkspaceId(currentWorkspaceId)
    }
  }, [currentWorkspaceId, workspaceId])

  useEffect(() => {
    if (
      !isOpen ||
      !initialTenant ||
      workspaces.length === 0 ||
      hasAutoSelectedRef.current
    )
      return

    const bestMatch = workspaces.reduce(
      (best, current) => {
        const distance = levenshteinDistance(
          initialTenant.toLowerCase(),
          current.name.toLowerCase()
        )
        return distance < best.distance ? { ws: current, distance } : best
      },
      { ws: workspaces[0], distance: Infinity }
    )

    if (bestMatch.ws && bestMatch.ws.id !== workspaceId) {
      setWorkspaceId(bestMatch.ws.id)
    }
    hasAutoSelectedRef.current = true
  }, [isOpen, initialTenant, workspaces, workspaceId])

  useEffect(() => {
    if (!isOpen) {
      hasAutoSelectedRef.current = false
    }
  }, [isOpen])

  const handleCreateClick = () => {
    onSubmit(
      {
        name,
        settings: { general: { type: 'TOOL' } },
        tenant,
        toolDescription,
      } as Typebot,
      workspaceId
    )
  }

  const isValid =
    name.trim() !== '' &&
    tenant.trim() !== '' &&
    toolDescription.trim() !== '' &&
    workspaceId !== ''

  // Same header icon-block treatment as RestApiCredentialsModal /
  // CredentialInUseModal / EditToolDescriptionModal: rounded-[0.875rem] p-2,
  // bg-ca-orange-light-5 (#fff0e9) / dark:bg-ca-orange-dark/20 (#e1580e @
  // 20%), icon text-ca-orange (#ff8638) / dark:text-ca-orange-light-2 (#f8b490).
  const iconBg = useColorModeValue('#fff0e9', 'rgba(225, 88, 14, 0.2)')
  const iconColor = useColorModeValue('#ff8638', '#f8b490')

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack spacing={3}>
            <Flex
              flexShrink={0}
              boxSize="40px"
              borderRadius="xl"
              bg={iconBg}
              color={iconColor}
              align="center"
              justify="center"
            >
              <ToolIcon boxSize="20px" />
            </Flex>
            <Text>{t('createTool.title')}</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Workspace</FormLabel>
              <Select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
              >
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Name</FormLabel>
              <Input
                placeholder="My awesome tool"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Tenant</FormLabel>
              <Input
                placeholder="e.g. workspace-123"
                value={tenant}
                onChange={(e) => setTenant(e.target.value)}
                isDisabled={!!initialTenant}
              />
              <FormHelperText>
                Identificador do tenant dentro do workspace.
              </FormHelperText>
            </FormControl>
            <FormControl isRequired>
              <FormLabel>{t('createTool.descriptionLabel')}</FormLabel>
              <Alert status="info" mb={2} borderRadius="md">
                <AlertIcon />
                {t('createTool.descriptionWarning')}
              </Alert>
              <Textarea
                placeholder={t('createTool.descriptionPlaceholder')}
                value={toolDescription}
                onChange={(e) => setToolDescription(e.target.value)}
                rows={4}
              />
            </FormControl>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            colorScheme="blue"
            onClick={handleCreateClick}
            isLoading={isLoading}
            isDisabled={!isValid}
          >
            {t('create')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

const levenshteinDistance = (a: string, b: string) => {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        )
      }
    }
  }

  return matrix[b.length][a.length]
}
