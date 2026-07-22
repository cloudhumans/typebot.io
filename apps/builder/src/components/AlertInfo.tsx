import {
  AlertProps,
  Alert,
  AlertIcon,
  useColorModeValue,
} from '@chakra-ui/react'

// Claudia cyan, set explicitly so this component never depends on the
// status="info" -> colorScheme="blue" -> variant -> theme-override chain
// (which can fall through to raw Chakra blue or the blue->primary/orange
// alias in theme.ts if any hop doesn't apply).
//
// Matches the claudia-app info callout (create-tool-dialog "Criar nova
// ferramenta"): rounded-xl bg-ca-cyan-light-3 text-ca-cyan-dark
// dark:bg-ca-cyan-dark/20 dark:text-ca-cyan-light-2.
//   light bg:    #d0f0fd            -> --color-ca-cyan-light-3
//   light icon:  #0b76b7            -> --color-ca-cyan-dark
//   dark bg:     rgba(11,118,183,.2) -> --color-ca-cyan-dark @ 20% (dark:/20)
//   dark icon:   #77d1f3            -> --color-ca-cyan-light-2
export const AlertInfo = (props: AlertProps) => {
  const bg = useColorModeValue('#d0f0fd', 'rgba(11, 118, 183, 0.2)')
  const iconColor = useColorModeValue('#0b76b7', '#77d1f3')

  return (
    <Alert status="info" rounded="xl" bg={bg} {...props}>
      <AlertIcon color={iconColor} />
      {props.children}
    </Alert>
  )
}
