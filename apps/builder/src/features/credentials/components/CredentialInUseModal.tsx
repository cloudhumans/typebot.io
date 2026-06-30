import { useEffect, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Code,
  Flex,
  HStack,
  IconButton,
  Input,
  Link,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  StackDivider,
  Text,
  useColorModeValue,
} from '@chakra-ui/react'
import { T, useTranslate } from '@tolgee/react'
import NextLink from 'next/link'
import {
  AlertIcon,
  CloseIcon,
  ExternalLinkIcon,
  ShieldAlertIcon,
} from '@/components/icons'

export type CredentialUsage = {
  source: 'Typebot' | 'PublicTypebot'
  // 'whatsApp' references drive the live flow, so they're badged distinctly
  // rather than as a plain draft.
  via?: 'block' | 'whatsApp'
  typebotId: string
  publicId: string | null
  name: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  usages: CredentialUsage[]
  credentialName?: string
  // 'delete' (default): the credential can't be deleted while referenced.
  // 'save': edits to a credential used by published flows apply in production.
  variant?: 'delete' | 'save'
  onForceDelete?: () => void
  isForceDeleting?: boolean
}

// Informs the user that a credential cannot be deleted because it is still
// referenced by flows in the workspace. The user must detach the credential
// from every listed flow before deletion is allowed.
export const CredentialInUseModal = ({
  isOpen,
  onClose,
  usages,
  credentialName,
  variant = 'delete',
  onForceDelete,
  isForceDeleting,
}: Props) => {
  const { t } = useTranslate()
  const isSave = variant === 'save'

  const iconBg = useColorModeValue('orange.100', 'orange.900')
  const iconColor = useColorModeValue('orange.500', 'orange.300')
  const subtitleColor = useColorModeValue('gray.600', 'gray.400')
  const cardBorderColor = useColorModeValue('gray.200', 'gray.700')
  const cardBg = useColorModeValue('gray.50', 'gray.800')
  const rowHoverBg = useColorModeValue('gray.100', 'gray.700')
  const slugColor = useColorModeValue('gray.500', 'gray.400')
  const mutedColor = useColorModeValue('gray.400', 'gray.500')
  const warningBg = useColorModeValue('red.50', 'red.900')
  const warningColor = useColorModeValue('red.700', 'red.200')

  // Force-deleting an in-use credential breaks live flows, so gate it behind
  // typing the credential name (deprecate/save is reversible — no guard there).
  const [typedName, setTypedName] = useState('')
  const trimmedCredentialName = credentialName?.trim() ?? ''
  const requiresNameConfirmation = !isSave && trimmedCredentialName.length > 0
  const isNameConfirmed =
    !requiresNameConfirmation || typedName.trim() === trimmedCredentialName

  useEffect(() => {
    if (!isOpen) setTypedName('')
  }, [isOpen])

  // Group references to the same flow together (published before draft) so
  // the two rows of one typebot sit next to each other.
  const sortedUsages = [...usages].sort(
    (a, b) =>
      a.typebotId.localeCompare(b.typebotId) || a.source.localeCompare(b.source)
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      scrollBehavior="inside"
      isCentered
    >
      <ModalOverlay />
      {/* Stop wheel from reaching the flow-editor canvas, which preventDefaults
          it for zoom/pan and would otherwise block scrolling inside the modal. */}
      <ModalContent borderRadius="xl" onWheel={(e) => e.stopPropagation()}>
        <ModalHeader pb={2}>
          <HStack spacing={4} align="flex-start">
            <Flex
              flexShrink={0}
              boxSize="44px"
              borderRadius="lg"
              bg={iconBg}
              color={iconColor}
              align="center"
              justify="center"
            >
              <ShieldAlertIcon boxSize="22px" />
            </Flex>
            <Stack spacing={1} flex={1} minW={0}>
              <Text fontSize="lg" fontWeight="bold" lineHeight="short">
                {t(
                  isSave ? 'credentialInUse.saveTitle' : 'credentialInUse.title'
                )}
              </Text>
              {credentialName && (
                <Text fontSize="sm" fontWeight="normal" color={subtitleColor}>
                  {t('credentialInUse.credentialName', {
                    name: credentialName,
                  })}
                </Text>
              )}
            </Stack>
            <IconButton
              aria-label={t('credentialInUse.close')}
              icon={<CloseIcon />}
              size="sm"
              variant="ghost"
              onClick={onClose}
            />
          </HStack>
        </ModalHeader>

        <ModalBody
          display="flex"
          flexDirection="column"
          gap={4}
          overflowY="auto"
        >
          <Text fontSize="sm">
            {t(isSave ? 'credentialInUse.saveBody' : 'credentialInUse.body', {
              count: usages.length,
            })}
          </Text>

          <Box
            maxH="280px"
            overflowY="auto"
            bg={cardBg}
            border="1px solid"
            borderColor={cardBorderColor}
            borderRadius="md"
          >
            <Stack
              spacing={0}
              divider={<StackDivider borderColor={cardBorderColor} />}
            >
              {sortedUsages.map((u) => (
                <Link
                  key={`${u.source}:${u.typebotId}:${u.via ?? ''}`}
                  as={NextLink}
                  href={`/typebots/${u.typebotId}/edit`}
                  display="block"
                  px={4}
                  py={3}
                  _hover={{ bg: rowHoverBg, textDecoration: 'none' }}
                >
                  <HStack spacing={3} align="center">
                    <Box flexShrink={0} w="90px">
                      <Badge
                        w="full"
                        textAlign="center"
                        borderRadius="full"
                        textTransform="uppercase"
                        fontSize="2xs"
                        letterSpacing="wide"
                        px={2}
                        py={0.5}
                        colorScheme={
                          u.via === 'whatsApp'
                            ? 'purple'
                            : u.source === 'PublicTypebot'
                            ? 'green'
                            : 'gray'
                        }
                      >
                        {u.via === 'whatsApp'
                          ? t('credentialInUse.whatsApp')
                          : u.source === 'PublicTypebot'
                          ? t('credentialInUse.published')
                          : t('credentialInUse.draft')}
                      </Badge>
                    </Box>
                    <Box flex={1} minW={0}>
                      <Text fontWeight="medium" noOfLines={1}>
                        {u.name}
                      </Text>
                      {u.publicId && (
                        <Text
                          fontFamily="mono"
                          fontSize="xs"
                          color={slugColor}
                          noOfLines={1}
                        >
                          /{u.publicId}
                        </Text>
                      )}
                    </Box>
                    <ExternalLinkIcon flexShrink={0} color={mutedColor} />
                  </HStack>
                </Link>
              ))}
            </Stack>
          </Box>

          {!isSave && (
            <Text fontSize="sm" color={subtitleColor}>
              {t('credentialInUse.instructions')}
            </Text>
          )}

          {onForceDelete && (
            <HStack
              align="flex-start"
              spacing={2.5}
              bg={warningBg}
              borderRadius="md"
              px={3.5}
              py={3}
            >
              <AlertIcon color={warningColor} mt="2px" flexShrink={0} />
              <Text fontSize="sm" color={warningColor}>
                {t(
                  isSave
                    ? 'credentialInUse.saveWarning'
                    : 'credentialInUse.forceWarning'
                )}
              </Text>
            </HStack>
          )}

          {onForceDelete && requiresNameConfirmation && (
            <Stack spacing={1.5}>
              <Text fontSize="sm" color={subtitleColor}>
                <T
                  keyName="credentialInUse.typeNameToConfirm"
                  params={{
                    name: trimmedCredentialName,
                    chip: <Code fontSize="sm" />,
                  }}
                />
              </Text>
              <Input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={credentialName}
                autoComplete="off"
              />
            </Stack>
          )}
        </ModalBody>

        <ModalFooter gap={3}>
          <Button colorScheme="orange" onClick={onClose}>
            {t('credentialInUse.acknowledge')}
          </Button>
          {onForceDelete && (
            <Button
              colorScheme={isSave ? 'orange' : 'red'}
              variant={isSave || isNameConfirmed ? 'solid' : 'outline'}
              onClick={onForceDelete}
              isLoading={isForceDeleting}
              isDisabled={!isNameConfirmed}
            >
              {t(
                isSave
                  ? 'credentialInUse.saveAnyway'
                  : 'credentialInUse.forceDelete'
              )}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
