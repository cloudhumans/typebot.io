import { AlertProps, Alert, useColorModeValue } from '@chakra-ui/react'
import { InfoIcon } from '@/components/icons'

// Mirrors the claudia-app info callout (create-tool-dialog "Criar nova
// ferramenta"). That callout is a <FormDescription> given a cyan className
// (text-ca-cyan-dark dark:text-ca-cyan-light-2), BUT FormDescription's own
// base style is `text-ca-primary-text! dark:text-ca-dark-7!` (!important) —
// which wins over the cyan. So what actually renders is GRAY text, and the
// <Info> icon (no explicit color) inherits that gray too. Only the cyan
// background survives. We reproduce the rendered result, not the misleading
// className:
//   light bg:         #d0f0fd            -> --color-ca-cyan-light-3
//   dark bg:          rgba(11,118,183,.2) -> --color-ca-cyan-dark @ 20% (dark:/20)
//   light text+icon:  #637381            -> --color-ca-primary-text
//   dark text+icon:   #cdced6            -> --color-ca-dark-7
// Icon: Typebot's outline InfoIcon (Feather geometry == lucide's <Info>),
// size 16, top-aligned (alignItems flex-start + mt 2px == claudia items-start
// + mt-0.5), instead of Chakra's <AlertIcon> solid glyph.
export const AlertInfo = (props: AlertProps) => {
  const bg = useColorModeValue('#d0f0fd', 'rgba(11, 118, 183, 0.2)')
  const fg = useColorModeValue('#637381', '#cdced6')

  return (
    <Alert
      status="info"
      rounded="xl"
      bg={bg}
      color={fg}
      alignItems="flex-start"
      {...props}
    >
      <InfoIcon color={fg} boxSize="16px" mr={2} mt="2px" />
      {props.children}
    </Alert>
  )
}
