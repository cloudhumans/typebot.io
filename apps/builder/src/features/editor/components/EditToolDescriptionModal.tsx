import {
  Button,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  Textarea,
  VStack,
  Alert,
  AlertIcon,
  useColorModeValue,
} from '@chakra-ui/react'
import { ToolIcon } from '@/components/icons'
import { useTranslate } from '@tolgee/react'
import React, { useState, useEffect } from 'react'

type Props = {
  isOpen: boolean
  onClose: () => void
  onSave: (toolDescription: string) => void
  initialToolDescription: string
  isLoading: boolean
}

export const EditToolDescriptionModal = ({
  isOpen,
  onClose,
  onSave,
  initialToolDescription,
  isLoading,
}: Props) => {
  const { t } = useTranslate()
  const [toolDescription, setToolDescription] = useState(initialToolDescription)

  useEffect(() => {
    setToolDescription(initialToolDescription)
  }, [initialToolDescription])

  const handleSaveClick = () => {
    onSave(toolDescription)
    onClose()
  }

  const isValid = toolDescription.trim() !== ''

  // Same header icon-block treatment as RestApiCredentialsModal /
  // CredentialInUseModal: rounded-[0.875rem] p-2, bg-ca-orange-light-5
  // (#fff0e9) / dark:bg-ca-orange-dark/20 (#e1580e @ 20%), icon
  // text-ca-orange (#ff8638) / dark:text-ca-orange-light-2 (#f8b490).
  const iconBg = useColorModeValue('#fff0e9', 'rgba(225, 88, 14, 0.2)')
  const iconColor = useColorModeValue('#ff8638', '#f8b490')

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack spacing={3}>
            <Flex
              flexShrink={0}
              boxSize="40px"
              borderRadius="xl"
              bg={iconBg}
              color={iconColor}
              align="center"
              justify="center"
            >
              <ToolIcon boxSize="20px" />
            </Flex>
            <Text>{t('editToolDescription.title')}</Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel>{t('editToolDescription.descriptionLabel')}</FormLabel>
              <Alert status="info" mb={2} borderRadius="md">
                <AlertIcon />
                {t('editToolDescription.descriptionWarning')}
              </Alert>
              <Textarea
                placeholder={t('editToolDescription.descriptionPlaceholder')}
                value={toolDescription}
                onChange={(e) => setToolDescription(e.target.value)}
                rows={4}
              />
            </FormControl>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            colorScheme="blue"
            onClick={handleSaveClick}
            isLoading={isLoading}
            isDisabled={!isValid}
          >
            {t('save')}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
