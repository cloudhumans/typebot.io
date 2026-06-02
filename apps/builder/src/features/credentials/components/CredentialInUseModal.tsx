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
  onConfirmForceDelete: () => void
  usages: CredentialUsage[]
  isForcing: boolean
  credentialName?: string
}

// Lists the flows that reference a credential the user just tried to delete,
// and offers a "force delete" override. The override triggers a
// credential_force_deleted audit log on the server.
export const CredentialInUseModal = ({
  isOpen,
  onClose,
  onConfirmForceDelete,
  usages,
  isForcing,
  credentialName,
}: Props) => {
  const cancelRef = useRef(null)

  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={onClose}
      size="lg"
    >
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            Essa credencial está em uso
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

              <Text fontSize="sm" color="orange.600">
                Deletar mesmo assim vai quebrar esses fluxos até que você
                associe outra credencial nos blocos afetados.
              </Text>
            </Stack>
          </AlertDialogBody>

          <AlertDialogFooter>
            <Button ref={cancelRef} onClick={onClose} isDisabled={isForcing}>
              Cancelar
            </Button>
            <Button
              colorScheme="red"
              onClick={onConfirmForceDelete}
              ml={3}
              isLoading={isForcing}
            >
              Deletar mesmo assim
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  )
}
