import { chakra, Text } from '@chakra-ui/react'
import { WaitBlock } from '@typebot.io/schemas'
import React, { useMemo } from 'react'

type Props = {
  options: WaitBlock['options']
}

// Matches {{ variableName }} capturing the inner content trimmed.
const VARIABLE_REGEX = /^\{\{\s*(.*?)\s*\}\}$/

export const WaitNodeContent = ({ options }: Props) => {
  const secondsToWaitFor = options?.secondsToWaitFor?.trim()

  const { isVariable, variableName } = useMemo(() => {
    if (!secondsToWaitFor) return { isVariable: false, variableName: '' }
    const match = secondsToWaitFor.match(VARIABLE_REGEX)
    return match
      ? { isVariable: true, variableName: match[1] }
      : { isVariable: false, variableName: '' }
  }, [secondsToWaitFor])

  // Unconfigured state
  if (!secondsToWaitFor) {
    return (
      <Text color="gray.500" noOfLines={1}>
        Configure...
      </Text>
    )
  }

  // Variable-based wait
  if (isVariable) {
    return (
      <Text noOfLines={1}>
        Wait for{' '}
        <chakra.span
          bgColor="orange.400"
          color="white"
          rounded="md"
          py="0.5"
          px="1"
        >
          {variableName}
        </chakra.span>{' '}
        seconds
      </Text>
    )
  }

  // Static seconds value
  return <Text noOfLines={1}>{`Wait for ${secondsToWaitFor} seconds`}</Text>
}
