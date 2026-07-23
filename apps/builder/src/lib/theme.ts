import {
  createMultiStyleConfigHelpers,
  defineStyleConfig,
  extendTheme,
  StyleFunctionProps,
  type ThemeConfig,
} from '@chakra-ui/react'
import { mode } from '@chakra-ui/theme-tools'
import {
  alertAnatomy,
  accordionAnatomy,
  menuAnatomy,
  modalAnatomy,
  popoverAnatomy,
  switchAnatomy,
} from '@chakra-ui/anatomy'

const config: ThemeConfig = {
  initialColorMode: 'system',
  useSystemColorMode: true,
}

const fonts = {
  heading:
    "Outfit, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'",
  body: "Open Sans, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'",
}

// Aligned to Claudia's radius scale (--radius: 0.625rem base).
const radii = {
  sm: '0.375rem', // 6px — --radius-sm
  md: '0.5rem', // 8px — --radius-md
  lg: '0.625rem', // 10px — --radius (base)
  xl: '0.875rem', // 14px — --radius-xl
}

// Claudia brand primary (base #ff8638 / hover #e1580e). This is the honest,
// named token; `blue` below is kept as a back-compat alias because Typebot's
// upstream components hardcode colorScheme="blue" as the de-facto primary.
const primary = {
  50: '#fff0e9',
  100: '#ffe0cf',
  200: '#ffc7a3',
  300: '#ffab74',
  400: '#ff9451',
  500: '#ff8638',
  600: '#e1580e',
  700: '#b8480b',
  800: '#8a3608',
  900: '#4f1f05',
}

export const colors = {
  gray: {
    50: '#fafafa',
    100: '#f4f4f5',
    200: '#e4e4e7',
    300: '#d4d4d8',
    400: '#a1a1aa',
    500: '#71717a',
    600: '#52525b',
    700: '#3f3f46',
    800: '#27272a',
    850: '#1f1f23',
    900: '#18181b',
  },
  primary,
  brand: primary,
  // Alias to `primary` — Typebot upstream hardcodes colorScheme="blue" and
  // blue.NNN as the primary across ~82 builder files. Aliasing here keeps the
  // override central and avoids a fork-wide rename that would conflict with
  // every upstream merge. New code should prefer `primary`/`brand`.
  blue: primary,
  orange: {
    50: '#fff1da',
    100: '#ffd7ae',
    200: '#ffbf7d',
    300: '#ffa54c',
    400: '#ff8b1a',
    500: '#e67200',
    600: '#b45800',
    700: '#813e00',
    800: '#4f2500',
    900: '#200b00',
  },
  yellow: {
    50: '#fff9da',
    100: '#ffedad',
    200: '#ffe17d',
    300: '#ffd54b',
    400: '#ffc91a',
    500: '#e6b000',
    600: '#b38800',
    700: '#806200',
    800: '#4e3a00',
    900: '#1d1400',
  },
  // Maps to Claudia's `--destructive` design token (shadCn.css). 500 is the
  // light-mode `--destructive`, 400 is the dark-mode `--destructive-foreground`
  // (brighter, used as the dark-mode base per the Button 'red' branch below).
  // Chakra's `colorScheme="red"` reads these directly, so every existing
  // destructive button retints with no call-site changes.
  red: {
    50: '#ffe0e2',
    100: '#ffb8bb',
    200: '#ff858a',
    300: '#ff525a',
    400: '#fb2c36',
    500: '#e7000b',
    600: '#cc000a',
    700: '#990007',
    800: '#6b0005',
    900: '#3d0003',
  },
}

const Modal = createMultiStyleConfigHelpers(
  modalAnatomy.keys
).defineMultiStyleConfig({
  baseStyle: ({ colorMode }) => ({
    dialog: { bg: colorMode === 'dark' ? 'gray.800' : 'white' },
  }),
})

const Popover = createMultiStyleConfigHelpers(
  popoverAnatomy.keys
).defineMultiStyleConfig({
  baseStyle: ({ colorMode }) => ({
    popper: {
      width: 'fit-content',
      maxWidth: 'fit-content',
    },
    content: {
      bg: colorMode === 'dark' ? 'gray.800' : 'white',
    },
  }),
})

const Menu = createMultiStyleConfigHelpers(
  menuAnatomy.keys
).defineMultiStyleConfig({
  baseStyle: ({ colorMode }) => ({
    list: {
      shadow: 'lg',
      bg: colorMode === 'dark' ? 'gray.800' : 'white',
    },
    item: {
      bg: colorMode === 'dark' ? 'gray.800' : 'white',
      _hover: {
        bg: colorMode === 'dark' ? 'gray.700' : 'gray.100',
      },
    },
  }),
})

const Accordion = createMultiStyleConfigHelpers(
  accordionAnatomy.keys
).defineMultiStyleConfig({
  baseStyle: ({ colorMode }) => ({
    button: {
      _hover: {
        bg: colorMode === 'dark' ? 'gray.800' : 'gray.100',
      },
    },
  }),
})

const Button = defineStyleConfig({
  baseStyle: ({ colorMode }) => ({
    bg: colorMode === 'dark' ? 'gray.800' : 'white',
  }),
  variants: {
    solid: ({ colorMode, colorScheme }) => {
      if (colorScheme === 'blue') {
        return {
          bg: colorMode === 'dark' ? 'blue.400' : 'blue.500',
          color: 'white',
          _hover: {
            bg: colorMode === 'dark' ? 'blue.500' : 'blue.600',
          },
          _active: {
            bg: colorMode === 'dark' ? 'blue.600' : 'blue.700',
          },
        }
      }
      if (colorScheme === 'orange') {
        return {
          bg: colorMode === 'dark' ? 'orange.400' : 'orange.500',
          color: 'white',
          // Darken on hover/active, matching the 'blue' (primary) branch above.
          // Was 'orange.400' (lighter than base) — made hover look washed out
          // instead of a pressed/darkened state (issue #165 follow-up).
          _hover: {
            bg: colorMode === 'dark' ? 'orange.500' : 'orange.600',
          },
          _active: {
            bg: colorMode === 'dark' ? 'orange.600' : 'orange.700',
          },
        }
      }
      if (colorScheme === 'red') {
        // Claudia destructive color (see `red` in `colors` above). Same
        // darken-on-hover/active pattern as 'blue'/'orange'.
        return {
          bg: colorMode === 'dark' ? 'red.400' : 'red.500',
          color: 'white',
          _hover: {
            bg: colorMode === 'dark' ? 'red.500' : 'red.600',
          },
          _active: {
            bg: colorMode === 'dark' ? 'red.600' : 'red.700',
          },
        }
      }
      return {}
    },
    outline: {
      bg: 'transparent',
    },
    ghost: {
      bg: 'transparent',
    },
  },
})

const Alert = createMultiStyleConfigHelpers(
  alertAnatomy.keys
).defineMultiStyleConfig({
  variants: {
    // status="info" maps to colorScheme="blue" too, but info callouts stay
    // Claudia cyan rather than following the orange remap above.
    // AlertInfo.tsx sets these same colors explicitly on itself (so it never
    // depends on this guard), but raw <Alert status="info" /> usages
    // elsewhere in the app still resolve through this variant, so it's kept
    // as the shared fallback for those rather than removed.
    subtle: ({ colorScheme, colorMode }) => {
      if (colorScheme !== 'blue') return {}
      return {
        container: {
          // Matches the claudia-app info callout (create-tool-dialog): cyan
          // background, but GRAY text+icon (claudia's FormDescription base
          // color `text-ca-primary-text!/dark:text-ca-dark-7!` overrides the
          // cyan className), top-aligned. See AlertInfo.tsx for the full note.
          // dark bg: rgba(11,118,183,.2) -> --color-ca-cyan-dark @ 20% (dark:/20)
          // light bg: #d0f0fd -> --color-ca-cyan-light-3
          bg: colorMode === 'dark' ? 'rgba(11, 118, 183, 0.2)' : '#d0f0fd',
          // dark: #cdced6 -> --color-ca-dark-7 / light: #637381 -> --color-ca-primary-text
          color: colorMode === 'dark' ? '#cdced6' : '#637381',
          alignItems: 'flex-start',
        },
        icon: {
          // Inherits the gray text color (claudia's <Info> has no own color).
          color: colorMode === 'dark' ? '#cdced6' : '#637381',
        },
      }
    },
  },
  baseStyle: {
    container: {
      borderRadius: 'md',
    },
  },
})

const Switch = createMultiStyleConfigHelpers(
  switchAnatomy.keys
).defineMultiStyleConfig({
  baseStyle: ({ colorMode, colorScheme }) => ({
    track: {
      _checked: {
        bg: colorMode === 'dark' ? `${colorScheme}.400` : `${colorScheme}.500`,
      },
    },
  }),
})

const components = {
  Modal,
  Popover,
  Menu,
  Button,
  Accordion,
  Alert,
  Switch,
  Spinner: {
    defaultProps: {
      colorScheme: 'blue',
    },
  },
  NumberInput: {
    baseStyle: {
      focusBorderColor: 'blue.200',
    },
  },
  Input: {
    baseStyle: {
      focusBorderColor: 'blue.200',
    },
  },
  Textarea: {
    baseStyle: {
      focusBorderColor: 'blue.200',
    },
  },
  Link: {
    baseStyle: {
      _hover: { textDecoration: 'none' },
    },
  },
  Tooltip: {
    baseStyle: {
      rounded: 'md',
    },
  },
}

const styles = {
  global: (props: StyleFunctionProps) => ({
    body: {
      bg: mode('white', 'gray.900')(props),
    },
  }),
}

// Shared brand-tint for the rounded icon block in modal headers
// (RestApiCredentialsModal, CredentialInUseModal, CreateToolModal,
// EditToolDescriptionModal). Light values are exact brand-scale steps; the
// dark values are the ca-orange design-system tints (bg = ca-orange-dark
// #e1580e @ 20%, fg = ca-orange-light-2 #f8b490) that have no native scale
// step, so they live here rather than being re-typed as raw hex at each site.
const semanticTokens = {
  colors: {
    modalHeaderIconBg: {
      default: 'brand.50',
      _dark: 'rgba(225, 88, 14, 0.2)',
    },
    modalHeaderIconFg: {
      default: 'brand.500',
      _dark: '#f8b490',
    },
  },
}

export const customTheme = extendTheme({
  colors,
  fonts,
  radii,
  components,
  config,
  styles,
  semanticTokens,
})
