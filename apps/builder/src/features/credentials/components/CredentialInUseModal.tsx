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
            Não é possível deletar essa credencial
          </AlertDialogHeader>

          <AlertDialogBody>
            <Stack spacing={4}>
              <Text>
                {credentialName ? (
                  <>
                    A credencial <strong>{credentialName}</strong> está sendo
                    usada por <strong>{usages.length}</strong> fluxo(s):
                  </>
                ) : (
                  <>
                    Essa credencial está sendo usada por{' '}
                    <strong>{usages.length}</strong> fluxo(s):
                  </>
                )}
              </Text>

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
                          ? 'publicado'
                          : 'rascunho'}
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
                Para deletar essa credencial, primeiro remova ou substitua ela
                nos blocos de todos os fluxos listados acima.
              </Text>
            </Stack>
          </AlertDialogBody>

          <AlertDialogFooter>
            <Button ref={closeRef} colorScheme="blue" onClick={onClose}>
              Entendi
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  )
}
