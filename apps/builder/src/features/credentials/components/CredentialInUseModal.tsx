import { useEffect, useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Button,
  HStack,
  Input,
  Link,
  List,
  ListItem,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useTranslate } from '@tolgee/react'
import NextLink from 'next/link'

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

  // Force-deleting an in-use credential breaks live flows, so gate it behind
  // typing the credential name (deprecate/save is reversible — no guard there).
  const [typedName, setTypedName] = useState('')
  const requiresNameConfirmation = !isSave && !!credentialName
  const isNameConfirmed =
    !requiresNameConfirmation || typedName.trim() === credentialName?.trim()

  useEffect(() => {
    if (!isOpen) setTypedName('')
  }, [isOpen])

  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={closeRef}
      onClose={onClose}
      size="lg"
    >
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            {t(isSave ? 'credentialInUse.saveTitle' : 'credentialInUse.title')}
          </AlertDialogHeader>

          <AlertDialogBody>
            <Stack spacing={4}>
              {credentialName && (
                <Text fontWeight="medium">
                  {t('credentialInUse.credentialName', {
                    name: credentialName,
                  })}
                </Text>
              )}

              <Text>
                {t(
                  isSave ? 'credentialInUse.saveBody' : 'credentialInUse.body',
                  {
                    count: usages.length,
                  }
                )}
              </Text>

              <List spacing={2} maxH="40vh" overflowY="auto">
                {usages.map((u) => (
                  <ListItem key={`${u.source}:${u.typebotId}`}>
                    <HStack>
                      <Badge
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
                      <Link
                        as={NextLink}
                        href={`/typebots/${u.typebotId}/edit`}
                        fontWeight="medium"
                        color="blue.500"
                      >
                        {u.name}
                      </Link>
                      {u.publicId && (
                        <Text fontSize="xs" color="gray.500">
                          /{u.publicId}
                        </Text>
                      )}
                    </HStack>
                  </ListItem>
                ))}
              </List>

              {!isSave && (
                <Text fontSize="sm" color="gray.600">
                  {t('credentialInUse.instructions')}
                </Text>
              )}

              {onForceDelete && (
                <Text fontSize="sm" color="red.500" fontWeight="medium">
                  {t(
                    isSave
                      ? 'credentialInUse.saveWarning'
                      : 'credentialInUse.forceWarning'
                  )}
                </Text>
              )}

              {onForceDelete && requiresNameConfirmation && (
                <Stack spacing={1}>
                  <Text fontSize="sm" color="gray.600">
                    {t('credentialInUse.typeNameToConfirm', {
                      name: credentialName,
                    })}
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
            <Button ref={closeRef} colorScheme="blue" onClick={onClose}>
              {t('credentialInUse.acknowledge')}
            </Button>
            {onForceDelete && (
              <Button
                colorScheme={isSave ? 'orange' : 'red'}
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
