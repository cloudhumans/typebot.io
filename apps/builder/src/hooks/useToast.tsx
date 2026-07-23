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
      // `duration` alimenta a barra de progresso e o auto-fechamento
      // controlado pela própria Toast (via onAnimationEnd). Quando definido,
      // passamos `null` ao Chakra para que ele não feche a toast em paralelo —
      // assim a barra e o fechamento ficam sempre em sincronia e podem pausar
      // enquanto o "Details" está expandido.
      let duration: number | null | undefined

      if (status === 'error' || status === 'success') {
        duration = 30000 // 30 segundos
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
