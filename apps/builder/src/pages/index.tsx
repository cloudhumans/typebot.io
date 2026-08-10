import { GetServerSidePropsContext } from 'next'
import { getServerSession } from 'next-auth'
import { getAuthOptions } from './api/auth/[...nextauth]'
import { patchSetCookieForPartitioned } from '@/features/auth/helpers/cookiePartitioning'

export default function Page() {
  return null
}

export const getServerSideProps = async (
  context: GetServerSidePropsContext
) => {
  patchSetCookieForPartitioned(context.res)
  const session = await getServerSession(
    context.req,
    context.res,
    getAuthOptions({})
  )
  if (!session?.user) {
    return {
      redirect: {
        permanent: false,
        destination:
          context.locale !== context.defaultLocale
            ? `/${context.locale}/signin`
            : '/signin',
      },
    }
  }
  return {
    redirect: {
      permanent: false,
      destination:
        context.locale !== context.defaultLocale
          ? `/${context.locale}/typebots`
          : '/typebots',
    },
  }
}
