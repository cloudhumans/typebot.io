import { useRef } from 'react'
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
  List,
  ListItem,
  Stack,
  Text,
} from '@chakra-ui/react'
import { useTranslate } from '@tolgee/react'

export type CredentialUsage = {
  source: 'Typebot' | 'PublicTypebot'
  typebotId: string
  publicId: string | null
  name: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  usages: CredentialUsage[]
  credentialName?: string
}

// Informs the user that a credential cannot be deleted because it is still
// referenced by flows in the workspace. The user must detach the credential
// from every listed flow before deletion is allowed.
export const CredentialInUseModal = ({
  isOpen,
  onClose,
  usages,
  credentialName,
}: Props) => {
  const { t } = useTranslate()
  const closeRef = useRef(null)

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
            {t('credentialInUse.title')}
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

              <Text>{t('credentialInUse.body', { count: usages.length })}</Text>

              <List spacing={2} maxH="40vh" overflowY="auto">
                {usages.map((u) => (
                  <ListItem key={`${u.source}:${u.typebotId}`}>
                    <HStack>
                      <Badge
                        colorScheme={
                          u.source === 'PublicTypebot' ? 'green' : 'gray'
                        }
                      >
                        {u.source === 'PublicTypebot'
                          ? t('credentialInUse.published')
                          : t('credentialInUse.draft')}
                      </Badge>
                      <Text fontWeight="medium">{u.name}</Text>
                      {u.publicId && (
                        <Text fontSize="xs" color="gray.500">
                          /{u.publicId}
                        </Text>
                      )}
                    </HStack>
                  </ListItem>
                ))}
              </List>

              <Text fontSize="sm" color="gray.600">
                {t('credentialInUse.instructions')}
              </Text>
            </Stack>
          </AlertDialogBody>

          <AlertDialogFooter>
            <Button ref={closeRef} colorScheme="blue" onClick={onClose}>
              {t('credentialInUse.acknowledge')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  )
}
