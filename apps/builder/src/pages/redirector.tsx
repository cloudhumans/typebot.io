// pages/redirector.tsx
import { getSession } from 'next-auth/react'

export async function getServerSideProps(context) {
  const session = await getSession(context)
  if (!session) {
    return { redirect: { destination: '/signin', permanent: false } }
  }

  let destination = 'https://default.example.com' // fallback destination
  if (session.user.client === 'clientA') {
    destination = 'https://clientA.example.com'
  } else if (session.user.client === 'clientB') {
    destination = 'https://clientB.example.com'
  }

  return {
    redirect: {
      destination,
      permanent: false,
    },
  }
}

export default function Redirector() {
  return null
}
