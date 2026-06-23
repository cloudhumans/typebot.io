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
import { useSearchParams } from 'next/navigation'
import { AlertInfo } from '@/components/AlertInfo'
import { GoogleLogo } from '@/components/GoogleLogo'
import { useToast } from '@/hooks/useToast'
import { getGoogleSheetsConsentScreenUrlQuery } from '../queries/getGoogleSheetsConsentScreenUrlQuery'
import {
  appendEmbeddedAuthParams,
  readEmbeddedAuthParams,
} from '../helpers/embeddedPopupParams'

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
  const searchParams = useSearchParams()
  const { showToast } = useToast()

  // Run the OAuth consent in a top-level popup instead of navigating the current
  // frame. Embedded inside CloudChat's iframe, Google refuses to render consent
  // (Sec-Fetch-Dest: iframe → 403); a popup that escapes the iframe sandbox is a
  // real top-level context. The callback hands the result back via postMessage,
  // which GoogleSheetsSettings listens for. See helpers/popupMessaging.ts.
  //
  // Embedded: the popup has no first-party session, so route it through the
  // /connect bootstrap page (carrying embedded=true&jwt) which authenticates
  // before bouncing to Google. Standalone: open the consent URL directly.
  const buildPopupUrl = () => {
    const embeddedAuth = readEmbeddedAuthParams(searchParams)
    // redirectUrl is only used by the callback to send the builder back here; it
    // strips the query (`split('?')[0]`) anyway. Pass origin+pathname only so the
    // embedded jwt never rides along into the consent GET — a multi-KB jwt in the
    // request would risk blowing Kong's header limit (502). The jwt travels solely
    // in the dedicated, short `jwt` param of the bootstrap popup URL.
    const redirectUrl = `${globalThis.location.origin}${globalThis.location.pathname}`
    const consentUrl = getGoogleSheetsConsentScreenUrlQuery(
      redirectUrl,
      blockId,
      workspace?.id,
      typebotId
    )
    if (!embeddedAuth.embedded || !embeddedAuth.jwt)
      return new URL(consentUrl, globalThis.location.origin).toString()

    const bootstrapParams = appendEmbeddedAuthParams(
      new URLSearchParams({
        redirectUrl,
        blockId,
        ...(workspace?.id ? { workspaceId: workspace.id } : {}),
        ...(typebotId ? { typebotId } : {}),
      }),
      embeddedAuth
    )
    return new URL(
      `/credentials/google-sheets/connect?${bootstrapParams.toString()}`,
      globalThis.location.origin
    ).toString()
  }

  const openConsentPopup = () => {
    const popup = globalThis.open(
      buildPopupUrl(),
      'gs-oauth',
      'popup,width=600,height=720'
    )
    // A null handle means the browser blocked the popup; keep the modal open and
    // tell the user, instead of silently closing it (the flow can't continue).
    if (!popup) {
      showToast({
        description:
          'Please allow popups for this site to connect your Google account.',
      })
      return
    }
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
