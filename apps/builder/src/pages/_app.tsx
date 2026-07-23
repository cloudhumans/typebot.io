import { useEffect } from 'react'
import { AppProps } from 'next/app'
import { SessionProvider } from 'next-auth/react'
import { ChakraProvider } from '@chakra-ui/react'
import { customTheme } from '@/lib/theme'
import { useRouterProgressBar } from '@/lib/routerProgressBar'
import '@/assets/styles/routerProgressBar.css'
import '@/assets/styles/plate.css'
import '@/assets/styles/resultsTable.css'
import '@/assets/styles/custom.css'
import '@/assets/styles/md.css'
import { UserProvider } from '@/features/account/UserProvider'
import { useRouter } from 'next/router'
import { SupportBubble } from '@/components/SupportBubble'
import { toTitleCase } from '@typebot.io/lib'
import { Plan } from '@typebot.io/prisma'
import { trpc } from '@/lib/trpc'
import { NewVersionPopup } from '@/components/NewVersionPopup'
import { TypebotProvider } from '@/features/editor/providers/TypebotProvider'
import { WorkspaceProvider } from '@/features/workspace/WorkspaceProvider'
import { isCloudProdInstance } from '@/helpers/isCloudProdInstance'
import { TolgeeProvider, useTolgeeSSR } from '@tolgee/react'
import { tolgee } from '@/lib/tolgee'
import { Toaster } from '@/components/Toaster'
import { EmbeddedAuthWrapper } from '@/features/embedded-auth'
import { useToast } from '@/hooks/useToast'

// Rendered inside ChakraProvider so it can use the toast context. Shows the
// Stripe upgrade-success toast that used to rely on a standalone toast
// container (which duplicated every toast — see git history).
const StripeUpgradeToast = () => {
  const router = useRouter()
  const { showToast } = useToast()

  useEffect(() => {
    const newPlan = router.query.stripe?.toString()
    if (newPlan === Plan.STARTER || newPlan === Plan.PRO)
      showToast({
        status: 'success',
        title: 'Upgrade success!',
        description: `Workspace upgraded to ${toTitleCase(newPlan)} 🎉`,
      })
  }, [router.query.stripe, showToast])

  return null
}

const App = ({ Component, pageProps }: AppProps) => {
  const router = useRouter()
  const ssrTolgee = useTolgeeSSR(tolgee, router.locale)

  useRouterProgressBar()

  useEffect(() => {
    if (
      router.pathname.endsWith('/edit') ||
      router.pathname.endsWith('/analytics')
    ) {
      document.body.style.overflow = 'hidden'
      document.body.classList.add('disable-scroll-x-behavior')
    } else {
      document.body.style.overflow = 'auto'
      document.body.classList.remove('disable-scroll-x-behavior')
    }
  }, [router.pathname])

  const typebotId = router.query.typebotId?.toString()

  return (
    <TolgeeProvider tolgee={ssrTolgee}>
      <ChakraProvider theme={customTheme}>
        <Toaster />
        <StripeUpgradeToast />
        <SessionProvider session={pageProps.session}>
          <EmbeddedAuthWrapper>
            <UserProvider>
              <TypebotProvider typebotId={typebotId}>
                <WorkspaceProvider typebotId={typebotId}>
                  <Component {...pageProps} />
                  {!router.pathname.endsWith('edit') &&
                    isCloudProdInstance() && <SupportBubble />}
                  <NewVersionPopup />
                </WorkspaceProvider>
              </TypebotProvider>
            </UserProvider>
          </EmbeddedAuthWrapper>
        </SessionProvider>
      </ChakraProvider>
    </TolgeeProvider>
  )
}

export default trpc.withTRPC(App)
