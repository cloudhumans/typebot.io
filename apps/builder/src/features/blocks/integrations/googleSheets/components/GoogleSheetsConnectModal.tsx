import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  Stack,
  Text,
  Image,
  Button,
  ModalFooter,
  Flex,
} from '@chakra-ui/react'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import React from 'react'
import { AlertInfo } from '@/components/AlertInfo'
import { GoogleLogo } from '@/components/GoogleLogo'
import { getGoogleSheetsConsentScreenUrlQuery } from '../queries/getGoogleSheetsConsentScreenUrlQuery'

type Props = {
  isOpen: boolean
  typebotId: string
  blockId: string
  onClose: () => void
}

export const GoogleSheetConnectModal = ({
  typebotId,
  blockId,
  isOpen,
  onClose,
}: Props) => {
  const { workspace } = useWorkspace()

  // Run the OAuth consent in a top-level popup instead of navigating the current
  // frame. Embedded inside CloudChat's iframe, Google refuses to render consent
  // (Sec-Fetch-Dest: iframe → 403); a popup that escapes the iframe sandbox is a
  // real top-level context. The callback hands the result back via postMessage,
  // which GoogleSheetsSettings listens for. See helpers/popupMessaging.ts.
  const openConsentPopup = () => {
    const consentUrl = new URL(
      getGoogleSheetsConsentScreenUrlQuery(
        globalThis.location.href,
        blockId,
        workspace?.id,
        typebotId
      ),
      globalThis.location.origin
    ).toString()
    globalThis.open(consentUrl, 'gs-oauth', 'popup,width=600,height=720')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Connect Spreadsheets</ModalHeader>
        <ModalCloseButton />
        <ModalBody as={Stack} spacing="6">
          <Text>
            Make sure to check all the permissions so that the integration works
            as expected:
          </Text>
          <Image
            src="/images/google-spreadsheets-scopes.png"
            alt="Google Spreadsheets checkboxes"
            rounded="md"
          />
          <AlertInfo>
            Google does not provide more granular permissions than
            &quot;read&quot; or &quot;write&quot; access. That&apos;s why it
            states that Typebot can also delete your spreadsheets which it
            won&apos;t.
          </AlertInfo>
          <Flex>
            <Button
              leftIcon={<GoogleLogo />}
              data-testid="google"
              variant="outline"
              onClick={openConsentPopup}
              mx="auto"
            >
              Continue with Google
            </Button>
          </Flex>
        </ModalBody>

        <ModalFooter />
      </ModalContent>
    </Modal>
  )
}
