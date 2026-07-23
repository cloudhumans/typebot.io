import {
  Box,
  Button,
  Flex,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useColorModeValue,
  useDisclosure,
} from '@chakra-ui/react'
import { useState } from 'react'

export type DebugVariable = {
  id: string
  name: string
  value?: unknown
}

const PANEL_WIDTH = 360
const HANDLE_WIDTH = 24
const HANDLE_HEIGHT = 120
const VALUE_MAX_CHARS = 40

const getVariableType = (value: unknown): string => {
  if (value === null || value === undefined) return 'Null'
  if (Array.isArray(value)) return 'List'
  switch (typeof value) {
    case 'number':
      return 'Number'
    case 'boolean':
      return 'Boolean'
    case 'object':
      return 'Object'
    default:
      return 'String'
  }
}

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const formatValueFull = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

type Props = {
  variables: DebugVariable[]
}

export const DebugVariablesPanel = ({ variables }: Props) => {
  const [isOpen, setIsOpen] = useState(false)
  const [modalVariable, setModalVariable] = useState<DebugVariable | null>(null)
  const {
    isOpen: isModalOpen,
    onOpen: onModalOpen,
    onClose: onModalClose,
  } = useDisclosure()

  const bgColor = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.700')
  const headerBg = useColorModeValue('gray.50', 'gray.900')
  const mutedColor = useColorModeValue('gray.500', 'gray.400')

  const panelWidth = isOpen ? PANEL_WIDTH : 0

  const openFullValue = (variable: DebugVariable) => {
    setModalVariable(variable)
    onModalOpen()
  }

  return (
    <Box
      pos="absolute"
      left="0"
      top="0"
      h="100%"
      w={`${PANEL_WIDTH + HANDLE_WIDTH}px`}
      transform="translateX(-100%)"
      zIndex={11}
      pointerEvents="none"
    >
      {/* Aba/puxador — posição vertical fixa (25% do topo); NÃO se move no
          hover (só no clique de abrir/fechar), pra não gerar flicker de cursor. */}
      <Flex
        as="button"
        type="button"
        aria-label="Alternar tabela de variáveis de debug"
        onClick={() => setIsOpen((open) => !open)}
        direction="column"
        align="center"
        justify="center"
        gap={1}
        pos="absolute"
        top="25%"
        right={isOpen ? `${PANEL_WIDTH}px` : '0'}
        transform="translateY(-50%)"
        h={`${HANDLE_HEIGHT}px`}
        w={`${HANDLE_WIDTH}px`}
        bgColor={bgColor}
        borderWidth="1px"
        borderRightWidth="0"
        borderColor={borderColor}
        borderLeftRadius="md"
        shadow="md"
        cursor="pointer"
        pointerEvents="auto"
        transition="right 0.2s ease, background 0.15s ease"
        _hover={{ bgColor: headerBg }}
      >
        <Text fontSize="sm" lineHeight="1" color={mutedColor}>
          {isOpen ? '›' : '‹'}
        </Text>
        <Text
          fontSize="10px"
          textTransform="uppercase"
          letterSpacing="wider"
          color={mutedColor}
          sx={{ writingMode: 'vertical-rl' }}
        >
          Debug
        </Text>
      </Flex>

      {/* Painel com a tabela. Aberto: colado ao test (right 0). Peek (hover):
          uma fresta à esquerda da aba. Fechado: largura 0. */}
      <Box
        pos="absolute"
        top="0"
        right={isOpen ? '0' : `${HANDLE_WIDTH}px`}
        h="100%"
        bgColor={bgColor}
        borderLeftWidth={panelWidth > 0 ? '1px' : '0'}
        borderColor={borderColor}
        overflow="hidden"
        shadow={isOpen ? 'lg' : 'none'}
        transition="width 0.2s ease, right 0.2s ease"
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={{ width: `${panelWidth}px` }}
      >
        <Flex direction="column" h="100%" w={`${PANEL_WIDTH}px`}>
          <Text
            px={3}
            py={2}
            fontWeight="semibold"
            fontSize="sm"
            borderBottomWidth="1px"
            borderColor={borderColor}
            flexShrink={0}
          >
            Variáveis (debug)
          </Text>
          <Box overflowY="auto" flex="1">
            {variables.length === 0 ? (
              <Text px={3} py={3} fontSize="sm" color={mutedColor}>
                Nenhuma variável preenchida ainda.
              </Text>
            ) : (
              <Table size="sm" variant="simple">
                <Thead pos="sticky" top={0} bgColor={headerBg} zIndex={1}>
                  <Tr>
                    <Th>Nome</Th>
                    <Th>Valor</Th>
                    <Th>Tipo</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {variables.map((variable) => {
                    const full = formatValue(variable.value)
                    const isTruncated = full.length > VALUE_MAX_CHARS
                    return (
                      <Tr key={variable.id}>
                        <Td fontWeight="medium" wordBreak="break-word">
                          {variable.name}
                        </Td>
                        <Td maxW="160px">
                          <Text wordBreak="break-word">
                            {isTruncated
                              ? `${full.slice(0, VALUE_MAX_CHARS)}…`
                              : full}
                          </Text>
                          {isTruncated && (
                            <Button
                              variant="link"
                              size="xs"
                              colorScheme="blue"
                              mt={1}
                              onClick={() => openFullValue(variable)}
                            >
                              Ver tudo
                            </Button>
                          )}
                        </Td>
                        <Td color={mutedColor}>
                          {getVariableType(variable.value)}
                        </Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            )}
          </Box>
        </Flex>
      </Box>

      {/* Modal com o valor completo de uma variável */}
      <Modal isOpen={isModalOpen} onClose={onModalClose} size="xl" isCentered>
        <ModalOverlay />
        <ModalContent pointerEvents="auto">
          <ModalHeader>{modalVariable?.name}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Box
              as="pre"
              fontSize="sm"
              fontFamily="mono"
              whiteSpace="pre-wrap"
              wordBreak="break-word"
              maxH="60vh"
              overflowY="auto"
              p={3}
              rounded="md"
              bgColor={headerBg}
            >
              {formatValueFull(modalVariable?.value)}
            </Box>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  )
}
