import {
  Box,
  Flex,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Text,
  useColorModeValue,
  VStack,
  Fade,
} from '@chakra-ui/react'
import { useRef, useEffect } from 'react'
import { useDashboardSearch } from '../providers/DashboardSearchProvider'
import { CloseIcon, SearchIcon } from '@/components/icons'
import { useTranslate } from '@tolgee/react'
import { useRouter } from 'next/router'
import { EmojiOrImageIcon } from '@/components/EmojiOrImageIcon'

export const DashboardSearchPanel = () => {
  const bg = useColorModeValue('white', 'gray.800')
  const borderColor = useColorModeValue('gray.200', 'gray.600')
  const resultHoverBg = useColorModeValue('gray.100', 'gray.700')

  const { t } = useTranslate()
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    isSearchOpen,
    searchQuery,
    setSearchQuery,
    searchResults,
    closeSearch,
  } = useDashboardSearch()

  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isSearchOpen])

  if (!isSearchOpen) return null

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value)
  }

  const handleResultClick = async (
    typebotId: string,
    folderId?: string | null
  ) => {
    closeSearch()

    // Navigate to the folder containing the typebot with hit parameterized
    if (folderId) {
      await router.push(`/typebots/folders/${folderId}?hit=${typebotId}`)
    } else {
      await router.push(`/typebots?hit=${typebotId}`)
    }

    // Scroll to the highlighted element after navigation
    setTimeout(() => {
      const el = document.getElementById(`typebot-${typebotId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 500)
  }

  return (
    <Fade in={isSearchOpen}>
      <Box
        position="fixed"
        top="100px"
        left="50%"
        transform="translateX(-50%)"
        zIndex={1400}
        bg={bg}
        borderRadius="lg"
        boxShadow="2xl"
        border="1px solid"
        borderColor={borderColor}
        minW="400px"
        maxW="500px"
        w="40%"
      >
        <HStack p={2} spacing={1}>
          <InputGroup size="sm">
            <InputLeftElement>
              <SearchIcon color="gray.400" boxSize={4} />
            </InputLeftElement>
            <Input
              id="dashboard-search-input"
              ref={inputRef}
              placeholder={t('editor.search.placeholder')}
              value={searchQuery}
              onChange={handleInputChange}
              borderRadius="md"
            />
          </InputGroup>

          <IconButton
            aria-label={t('editor.search.closeSearch')}
            icon={<CloseIcon />}
            size="sm"
            variant="ghost"
            onClick={closeSearch}
          />
        </HStack>

        {searchQuery.trim().length > 0 && (
          <VStack
            align="stretch"
            spacing={0}
            maxH="400px"
            overflowY="auto"
            borderTop="1px solid"
            borderColor={borderColor}
          >
            {searchResults.length === 0 ? (
              <Box p={4} textAlign="center">
                <Text color="gray.500" fontSize="sm">
                  {t('editor.search.noResults')}
                </Text>
              </Box>
            ) : (
              searchResults.map((typebot) => (
                <Flex
                  key={typebot.id}
                  p={3}
                  cursor="pointer"
                  _hover={{ bg: resultHoverBg }}
                  onClick={() =>
                    handleResultClick(typebot.id, typebot.folderId)
                  }
                  align="center"
                  gap={3}
                >
                  <EmojiOrImageIcon
                    icon={typebot.icon}
                    boxSize="20px"
                    emojiFontSize="20px"
                  />
                  <VStack align="start" spacing={0} flex={1} minW={0}>
                    <Text fontSize="sm" fontWeight="medium" noOfLines={1}>
                      {typebot.name}
                    </Text>
                  </VStack>
                </Flex>
              ))
            )}
          </VStack>
        )}
      </Box>
    </Fade>
  )
}
