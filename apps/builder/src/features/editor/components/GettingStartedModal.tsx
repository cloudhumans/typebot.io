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
  usePrefersReducedMotion,
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
  const prefersReducedMotion = usePrefersReducedMotion()

  /** Drops a decorative animation when the OS asks for reduced motion. */
  const motion = (value: string) => (prefersReducedMotion ? undefined : value)

  const bodyBg = useColorModeValue(brand.cream, 'gray.850')
  const cardBg = useColorModeValue('white', 'gray.800')
  // In dark mode the card (`gray.800`) sits on the dialog (`gray.850`) at
  // 1.10:1, and shadows are invisible there — the border is all that separates
  // them. `whiteAlpha.400` puts that edge at 3.32:1, clearing the 3:1 WCAG
  // 1.4.11 threshold for non-text contrast.
  const cardBorder = useColorModeValue('blackAlpha.100', 'whiteAlpha.400')
  const cardTitleColor = useColorModeValue(brand.ink, 'gray.100')
  const cardTextColor = useColorModeValue('gray.600', 'gray.400')
  const iconBg = useColorModeValue('primary.50', 'whiteAlpha.100')
  const dialogBorder = useColorModeValue('blackAlpha.50', 'whiteAlpha.200')
  // `brand.orange` on `brand.cream` is 2.47:1 — under AA for this 14px/600
  // link. `primary.700` is 5.03:1 in the same hue. Dark mode already passed at
  // 6.32:1, so it keeps `brand.orange`.
  const faqColor = useColorModeValue('primary.700', brand.orange)

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
        // There is no `ModalHeader` here (the title lives inside the hero), so
        // Chakra emits no `aria-labelledby` and the dialog would go unnamed.
        // Passing `aria-labelledby` in doesn't help: `getDialogProps` spreads
        // our props first and then hardcodes the attribute. `aria-label`
        // survives that spread.
        aria-label={t('editor.gettingStartedModal.welcome.title')}
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
          // The hero is a sibling of `ModalBody`, so it gets none of the
          // `flex: 1; overflow: auto` the theme gives the body. Without this it
          // shrinks below its content height once `scrollBehavior="inside"`
          // caps the dialog, and the clipped part can't be scrolled to. The
          // short-viewport padding keeps it from pushing the cards off-screen.
          flexShrink={0}
          px={{ base: 6, md: 10 }}
          pt={{ base: 7, md: 9 }}
          pb={{ base: 8, md: 10 }}
          sx={{
            '@media (max-height: 800px)': { paddingTop: 4, paddingBottom: 5 },
          }}
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
            animation={motion(`${floatBlob} 11s ease-in-out infinite`)}
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
            animation={motion(`${floatBlob} 14s ease-in-out infinite reverse`)}
          />

          {/* The sparkles exist only to twinkle, so reduced motion drops them
              rather than leaving five static dots on the gradient. */}
          {!prefersReducedMotion &&
            sparkles.map((s, i) => (
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

          {/* White copy on the orange-to-yellow gradient is 1.53-2.60:1 on its
              own. This scrim darkens only the column the text occupies, taking
              the worst case to 6.05:1 and leaving the gradient untouched on the
              mascot side. */}
          <Box
            aria-hidden
            position="absolute"
            inset={0}
            bg={{ base: 'blackAlpha.500', md: 'transparent' }}
            bgGradient={{
              base: 'none',
              md: 'linear(to-r, blackAlpha.500 0%, blackAlpha.500 60%, transparent 88%)',
            }}
          />

          <Stack
            position="relative"
            spacing={{ base: 4, md: 5 }}
            maxW={{ base: '100%', md: '62%' }}
          >
            <HStack
              spacing={2.5}
              animation={motion(`${riseIn} .5s ease-out both`)}
            >
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
                animation={motion(`${riseIn} .5s ease-out .05s both`)}
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
                animation={motion(`${riseIn} .5s ease-out .1s both`)}
              >
                {t('editor.gettingStartedModal.welcome.title')}
              </Heading>

              <Text
                fontSize={{ base: 'sm', md: 'md' }}
                color="whiteAlpha.900"
                animation={motion(`${riseIn} .5s ease-out .18s both`)}
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
                animation={motion(
                  `${riseIn} .5s ease-out ${0.24 + i * 0.08}s both`
                )}
                _hover={{
                  transform: 'translateY(-4px)',
                  shadow: `0 14px 28px -16px ${brand.orange}80`,
                  borderColor: `${brand.orange}55`,
                }}
              >
                <Box
                  aria-hidden
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
            animation={motion(`${riseIn} .5s ease-out .5s both`)}
          >
            <Link
              href={t('editor.gettingStartedModal.welcome.faq')}
              isExternal
              fontSize="sm"
              fontWeight="600"
              color={faqColor}
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
