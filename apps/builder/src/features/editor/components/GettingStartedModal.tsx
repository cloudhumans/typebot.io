import heroImage from '../images/fluxos-controlados-hero.jpg'

import {
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalCloseButton,
  ModalBody,
  Stack,
  HStack,
  Text,
  Link,
  Box,
  Button,
  Heading,
  SimpleGrid,
  keyframes,
  useColorModeValue,
} from '@chakra-ui/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { useTranslate } from '@tolgee/react'
import { CloudLogo } from '@/components/logos/CloudLogo'

/** Cloud Humans brand palette */
const brand = {
  orange: '#ff7b00',
  tangerine: '#ff9a3c',
  amber: '#f8ba05',
  cream: '#fff8f4',
  ink: '#404348',
}

const floatBlob = keyframes`
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  50% { transform: translate3d(-18px, 14px, 0) scale(1.12); }
`

const twinkle = keyframes`
  0%, 100% { opacity: 0; transform: scale(.4); }
  50% { opacity: 1; transform: scale(1); }
`

const riseIn = keyframes`
  from { opacity: 0; transform: translate3d(0, 14px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
`

const sparkles = [
  { top: '18%', left: '46%', size: '6px', delay: '0s' },
  { top: '32%', left: '8%', size: '4px', delay: '.6s' },
  { top: '64%', left: '38%', size: '5px', delay: '1.2s' },
  { top: '12%', left: '24%', size: '3px', delay: '1.8s' },
  { top: '74%', left: '14%', size: '4px', delay: '2.4s' },
]

const cards = [
  { key: 'build', emoji: '🧩' },
  { key: 'claudia', emoji: '🤝' },
  { key: 'publish', emoji: '🚀' },
] as const

/**
 * The Cloud Humans symbol is orange, so it needs a light plate to stay legible
 * on the brand gradient.
 */
const CloudHumansMark = () => (
  <Box
    bg="white"
    rounded="xl"
    px={2}
    py={2}
    display="flex"
    alignItems="center"
    justifyContent="center"
    flexShrink={0}
    shadow="0 4px 12px -4px rgba(0,0,0,.25)"
  >
    <CloudLogo viewBox="0 19 150 112" w="35px" h="26px" />
  </Box>
)

export const GettingStartedModal = () => {
  const { t } = useTranslate()
  const { query } = useRouter()
  const { isOpen, onOpen, onClose } = useDisclosure()

  const bodyBg = useColorModeValue(brand.cream, 'gray.850')
  const cardBg = useColorModeValue('white', 'gray.800')
  const cardBorder = useColorModeValue('blackAlpha.100', 'whiteAlpha.100')
  const cardTitleColor = useColorModeValue(brand.ink, 'gray.100')
  const cardTextColor = useColorModeValue('gray.600', 'gray.400')
  const iconBg = useColorModeValue('primary.50', 'whiteAlpha.100')
  const dialogBorder = useColorModeValue('blackAlpha.50', 'whiteAlpha.200')

  useEffect(() => {
    const isFirstBot = Array.isArray(query.isFirstBot)
      ? query.isFirstBot[0]
      : query.isFirstBot

    if (isFirstBot === 'true') onOpen()
  }, [query.isFirstBot, onOpen])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="4xl"
      isCentered
      motionPreset="slideInBottom"
      scrollBehavior="inside"
    >
      <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(6px)" />
      <ModalContent
        // The flow-editor canvas listens for wheel events to pan/zoom; without
        // this the three stacked cards can't be scrolled on short viewports.
        onWheel={(e) => e.stopPropagation()}
        overflow="hidden"
        rounded="3xl"
        bg={bodyBg}
        border="1px solid"
        borderColor={dialogBorder}
        shadow={`0 24px 70px -20px ${brand.orange}66, 0 10px 30px -15px rgba(0,0,0,.35)`}
        mx={4}
      >
        <ModalCloseButton
          top={4}
          right={4}
          zIndex={2}
          color="white"
          bg="blackAlpha.400"
          rounded="full"
          backdropFilter="blur(4px)"
          _hover={{ bg: 'blackAlpha.600' }}
        />

        {/* Hero */}
        <Box
          position="relative"
          overflow="hidden"
          px={{ base: 6, md: 10 }}
          pt={{ base: 7, md: 9 }}
          pb={{ base: 8, md: 10 }}
          bgGradient={`linear(135deg, ${brand.orange} 0%, ${brand.tangerine} 52%, ${brand.amber} 100%)`}
        >
          {/* mascots emerging from the gradient */}
          <Box
            aria-hidden
            position="absolute"
            top={0}
            right={0}
            bottom={0}
            w={{ base: '52%', md: '46%' }}
            bgImage={`url(${heroImage.src})`}
            bgSize="cover"
            bgPosition="center 35%"
            opacity={{ base: 0.35, md: 0.9 }}
            sx={{
              maskImage:
                'linear-gradient(to left, rgba(0,0,0,1) 32%, rgba(0,0,0,0) 100%)',
              WebkitMaskImage:
                'linear-gradient(to left, rgba(0,0,0,1) 32%, rgba(0,0,0,0) 100%)',
            }}
          />

          {/* glow blobs */}
          <Box
            aria-hidden
            position="absolute"
            top="-40%"
            left="-10%"
            w="320px"
            h="320px"
            rounded="full"
            bg="radial-gradient(circle, rgba(255,255,255,.55) 0%, rgba(255,255,255,0) 70%)"
            filter="blur(6px)"
            animation={`${floatBlob} 11s ease-in-out infinite`}
          />
          <Box
            aria-hidden
            position="absolute"
            bottom="-55%"
            left="30%"
            w="280px"
            h="280px"
            rounded="full"
            bg={`radial-gradient(circle, ${brand.amber}aa 0%, rgba(248,186,5,0) 70%)`}
            filter="blur(10px)"
            animation={`${floatBlob} 14s ease-in-out infinite reverse`}
          />

          {sparkles.map((s, i) => (
            <Box
              key={i}
              aria-hidden
              position="absolute"
              top={s.top}
              left={s.left}
              w={s.size}
              h={s.size}
              rounded="full"
              bg="white"
              animation={`${twinkle} 3.4s ease-in-out ${s.delay} infinite`}
            />
          ))}

          <Stack
            position="relative"
            spacing={{ base: 4, md: 5 }}
            maxW={{ base: '100%', md: '62%' }}
          >
            <HStack spacing={2.5} animation={`${riseIn} .5s ease-out both`}>
              <CloudHumansMark />
              <Text
                fontFamily="heading"
                fontWeight="600"
                fontSize="sm"
                letterSpacing="wide"
                color="whiteAlpha.900"
                lineHeight="1.1"
              >
                cloud
                <br />
                humans
              </Text>
            </HStack>

            <Stack spacing={3}>
              <HStack
                alignSelf="flex-start"
                spacing={1.5}
                px={3}
                py={1}
                rounded="full"
                bg="whiteAlpha.300"
                backdropFilter="blur(4px)"
                animation={`${riseIn} .5s ease-out .05s both`}
              >
                <Box w="6px" h="6px" rounded="full" bg="white" />
                <Text
                  fontSize="xs"
                  fontWeight="700"
                  color="white"
                  letterSpacing="wider"
                  textTransform="uppercase"
                >
                  {t('editor.gettingStartedModal.welcome.badge')}
                </Text>
              </HStack>

              <Heading
                as="h2"
                fontSize={{ base: '2xl', md: '4xl' }}
                lineHeight="1.1"
                color="white"
                textShadow="0 2px 18px rgba(0,0,0,.18)"
                animation={`${riseIn} .5s ease-out .1s both`}
              >
                {t('editor.gettingStartedModal.welcome.title')}
              </Heading>

              <Text
                fontSize={{ base: 'sm', md: 'md' }}
                color="whiteAlpha.900"
                animation={`${riseIn} .5s ease-out .18s both`}
              >
                {t('editor.gettingStartedModal.welcome.subtitle')}
              </Text>
            </Stack>
          </Stack>
        </Box>

        <ModalBody as={Stack} spacing={7} px={{ base: 6, md: 10 }} py={8}>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            {cards.map(({ key, emoji }, i) => (
              <Stack
                key={key}
                spacing={3}
                p={5}
                rounded="2xl"
                bg={cardBg}
                border="1px solid"
                borderColor={cardBorder}
                shadow="sm"
                transition="transform .2s ease, box-shadow .2s ease, border-color .2s ease"
                animation={`${riseIn} .5s ease-out ${0.24 + i * 0.08}s both`}
                _hover={{
                  transform: 'translateY(-4px)',
                  shadow: `0 14px 28px -16px ${brand.orange}80`,
                  borderColor: `${brand.orange}55`,
                }}
              >
                <Box
                  fontSize="xl"
                  lineHeight="1"
                  w="40px"
                  h="40px"
                  rounded="xl"
                  bg={iconBg}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  {emoji}
                </Box>
                <Text
                  fontFamily="heading"
                  fontWeight="700"
                  fontSize="md"
                  color={cardTitleColor}
                >
                  {t(`editor.gettingStartedModal.welcome.cards.${key}.title`)}
                </Text>
                <Text fontSize="sm" color={cardTextColor} lineHeight="1.6">
                  {t(
                    `editor.gettingStartedModal.welcome.cards.${key}.description`
                  )}
                </Text>
              </Stack>
            ))}
          </SimpleGrid>

          <Stack
            direction={{ base: 'column', md: 'row' }}
            align="center"
            justify="space-between"
            spacing={4}
            animation={`${riseIn} .5s ease-out .5s both`}
          >
            <Link
              href={t('editor.gettingStartedModal.welcome.faq')}
              isExternal
              fontSize="sm"
              fontWeight="600"
              color={brand.orange}
              _hover={{ textDecoration: 'underline' }}
            >
              {t('editor.gettingStartedModal.welcome.faqLabel')} →
            </Link>

            <Button
              onClick={onClose}
              size="lg"
              rounded="full"
              px={8}
              color="white"
              bgGradient={`linear(135deg, ${brand.orange}, ${brand.amber})`}
              shadow={`0 10px 24px -10px ${brand.orange}cc`}
              transition="transform .2s ease, box-shadow .2s ease"
              _hover={{
                bgGradient: `linear(135deg, ${brand.orange}, ${brand.amber})`,
                transform: 'translateY(-2px)',
                shadow: `0 16px 30px -10px ${brand.orange}`,
              }}
              _active={{ transform: 'translateY(0)' }}
            >
              {t('editor.gettingStartedModal.welcome.cta')}
            </Button>
          </Stack>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
