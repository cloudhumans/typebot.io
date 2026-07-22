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
//   light bg:    #d0f0fd -> --color-ca-cyan-light-3
//   light icon:  #01a9db -> --color-ca-cyan
//   dark bg:     rgba(1, 169, 219, 0.24) -> translucent --color-ca-cyan
//   dark icon:   #77d1f3 -> --color-ca-cyan-light-2
export const AlertInfo = (props: AlertProps) => {
  const bg = useColorModeValue('#d0f0fd', 'rgba(1, 169, 219, 0.24)')
  const iconColor = useColorModeValue('#01a9db', '#77d1f3')

  return (
    <Alert status="info" rounded="md" bg={bg} {...props}>
      <AlertIcon color={iconColor} />
      {props.children}
    </Alert>
  )
}
