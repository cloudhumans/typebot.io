import {
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  ModalBody,
  Stack,
  Text,
  Link, // Added Link import
  Image,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useTranslate } from '@tolgee/react'

export const GettingStartedModal = () => {
  const { t } = useTranslate()
  const { query } = useRouter()
  const { isOpen, onOpen, onClose } = useDisclosure()

  useEffect(() => {
    const isFirstBot = Array.isArray(query.isFirstBot)
      ? query.isFirstBot[0]
      : query.isFirstBot

    if (isFirstBot === 'true') onOpen()
  }, [query.isFirstBot, onOpen])

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalCloseButton />
        <ModalBody as={Stack} spacing="8" py="10">
          <Text>{t('editor.gettingStartedModal.editorBasics.list.paragraph')}</Text>
          <Text>{t('editor.gettingStartedModal.editorBasics.list.paragraph2')}</Text>
          <Text>{t('editor.gettingStartedModal.editorBasics.list.paragraph3')}</Text>
          <Text>
            {t('editor.gettingStartedModal.editorBasics.list.paragraph4')}
          </Text>
          <Link href={t('editor.gettingStartedModal.editorBasics.list.faq')} isExternal>
            <Text as="span" color="blue.500" _hover={{ textDecoration: 'underline', cursor: 'pointer' }}>
              {t('editor.gettingStartedModal.editorBasics.list.faq')}
            </Text>
          </Link>

          {/* FAQ image */}
          <Image
            src="https://i.postimg.cc/Sx0h6wRN/image.jpg"
            alt={t('editor.gettingStartedModal.editorBasics.list.imageEddie')}
            mt={4}
            borderRadius="md"
            maxW="100%"
          />
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
