import { Toast, ToastProps } from '@/components/Toast'
import { useToast as useChakraToast } from '@chakra-ui/react'
import { useCallback } from 'react'

export const useToast = () => {
  const toast = useChakraToast()

  const showToast = useCallback(
    ({
      title,
      description,
      status = 'error',
      icon,
      details,
      primaryButton,
      secondaryButton,
    }: Omit<ToastProps, 'onClose'>) => {
      // `duration` drives the progress bar and the auto-dismiss, both handled
      // by the Toast component itself (via onAnimationEnd). When it is set we
      // pass `null` to Chakra so it doesn't dismiss the toast in parallel —
      // that keeps the bar and the dismissal in sync and lets them pause while
      // the "Details" section is expanded.
      let duration: number | null | undefined

      if (status === 'error' || status === 'success') {
        duration = 30000 // 30 seconds
      } else {
        duration = undefined // Default
      }

      toast({
        position: 'top-right',
        duration: duration ? null : undefined,
        render: ({ onClose }) => (
          <Toast
            title={title}
            description={description}
            status={status}
            icon={icon}
            details={details}
            duration={duration}
            onClose={onClose}
            primaryButton={primaryButton}
            secondaryButton={secondaryButton}
          />
        ),
      })
    },
    [toast]
  )

  return { showToast }
}
