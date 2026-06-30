import { useEffect, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Box,
  Button,
  Code,
  Flex,
  HStack,
  IconButton,
  Input,
  Link,
  Stack,
  StackDivider,
  Text,
  useColorModeValue,
} from '@chakra-ui/react'
import { T, useTranslate } from '@tolgee/react'
import NextLink from 'next/link'
import { AlertIcon, CloseIcon, ExternalLinkIcon } from '@/components/icons'

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
  const closeRef = useRef(null)
  const isSave = variant === 'save'

  const iconBg = useColorModeValue('orange.100', 'orange.900')
  const iconColor = useColorModeValue('orange.500', 'orange.300')
  const subtitleColor = useColorModeValue('gray.600', 'gray.400')
  const cardBorderColor = useColorModeValue('gray.200', 'gray.700')
  const cardBg = useColorModeValue('gray.50', 'gray.800')
  const rowHoverBg = useColorModeValue('gray.100', 'gray.700')
  const slugColor = useColorModeValue('gray.500', 'gray.400')
  const mutedColor = useColorModeValue('gray.400', 'gray.500')
  const warningBg = useColorModeValue('red.50', 'rgba(229,62,62,0.12)')
  const warningBorder = useColorModeValue('red.200', 'red.700')
  const warningColor = useColorModeValue('red.600', 'red.300')

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

  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={closeRef}
      onClose={onClose}
      size="xl"
    >
      <AlertDialogOverlay>
        <AlertDialogContent borderRadius="xl">
          <AlertDialogHeader pb={2}>
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
                <AlertIcon boxSize="22px" />
              </Flex>
              <Stack spacing={1} flex={1} minW={0}>
                <Text fontSize="lg" fontWeight="bold" lineHeight="short">
                  {t(
                    isSave
                      ? 'credentialInUse.saveTitle'
                      : 'credentialInUse.title'
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
                ref={closeRef}
                aria-label={t('credentialInUse.acknowledge')}
                icon={<CloseIcon />}
                size="sm"
                variant="ghost"
                onClick={onClose}
              />
            </HStack>
          </AlertDialogHeader>

          <AlertDialogBody>
            <Stack spacing={4}>
              <Text fontSize="sm">
                {t(
                  isSave ? 'credentialInUse.saveBody' : 'credentialInUse.body',
                  {
                    count: usages.length,
                  }
                )}
              </Text>

              <Stack
                spacing={0}
                maxH="40vh"
                overflowY="auto"
                bg={cardBg}
                border="1px solid"
                borderColor={cardBorderColor}
                borderRadius="md"
                divider={<StackDivider borderColor={cardBorderColor} />}
              >
                {usages.map((u) => (
                  <Link
                    key={`${u.source}:${u.typebotId}`}
                    as={NextLink}
                    href={`/typebots/${u.typebotId}/edit`}
                    display="block"
                    px={4}
                    py={3}
                    _hover={{ bg: rowHoverBg, textDecoration: 'none' }}
                  >
                    <HStack spacing={3} align="center">
                      <Badge
                        flexShrink={0}
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
                  border="1px solid"
                  borderColor={warningBorder}
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
                        name: (
                          <Code fontSize="sm">{trimmedCredentialName}</Code>
                        ),
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
            </Stack>
          </AlertDialogBody>

          <AlertDialogFooter gap={3}>
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
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  )
}
