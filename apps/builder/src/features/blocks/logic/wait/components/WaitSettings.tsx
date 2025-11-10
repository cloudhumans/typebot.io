import { Stack, useToast } from '@chakra-ui/react'
import React from 'react'
import { TextInput } from '@/components/inputs'
import { WaitBlock } from '@typebot.io/schemas'

type Props = {
  options: WaitBlock['options']
  onOptionsChange: (options: WaitBlock['options']) => void
}

export const WaitSettings = ({ options, onOptionsChange }: Props) => {
  const toast = useToast()

  const handleSecondsChange = (value: string | undefined) => {
    if (!value) {
      onOptionsChange({ ...options, secondsToWaitFor: undefined })
      return
    }

    const parsed = parseFloat(value)

    if (isNaN(parsed)) return

    const clamped = Math.min(parsed, 30)

    if (parsed > 30) {
      toast({
        title: 'Maximum limit reached',
        description: 'The maximum waiting time allowed is 30 seconds.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      })
    }
    onOptionsChange({ ...options, secondsToWaitFor: clamped.toString() })
  }

  return (
    <Stack spacing={4}>
      <TextInput
        label="Seconds to wait for (max 30s):"
        defaultValue={options?.secondsToWaitFor}
        onChange={handleSecondsChange}
      />
    </Stack>
  )
}
