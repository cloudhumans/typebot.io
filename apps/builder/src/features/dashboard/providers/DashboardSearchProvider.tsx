import {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useWorkspace } from '@/features/workspace/WorkspaceProvider'
import { useTypebots } from '../hooks/useTypebots'
import { useDebounce } from 'use-debounce'
import { TypebotInDashboard } from '../types'
import { useRouter } from 'next/router'

type DashboardSearchContextType = {
  isSearchOpen: boolean
  setIsSearchOpen: Dispatch<SetStateAction<boolean>>
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
  searchResults: TypebotInDashboard[]
  closeSearch: () => void
  highlightedTypebotId: string | null
  setHighlightedTypebotId: Dispatch<SetStateAction<string | null>>
}

const dashboardSearchContext = createContext<DashboardSearchContextType>({
  isSearchOpen: false,
  setIsSearchOpen: () => {},
  searchQuery: '',
  setSearchQuery: () => {},
  searchResults: [],
  closeSearch: () => {},
  highlightedTypebotId: null,
  setHighlightedTypebotId: () => {},
})

export const DashboardSearchProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const router = useRouter()
  const { workspace } = useWorkspace()
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedTypebotId, setHighlightedTypebotId] = useState<
    string | null
  >(null)

  // Sync highlight from URL and clean URL up
  useEffect(() => {
    if (router.query.hit) {
      setHighlightedTypebotId(router.query.hit as string)
      const newQuery = { ...router.query }
      delete newQuery.hit
      router.replace(
        { pathname: router.pathname, query: newQuery },
        undefined,
        { shallow: true }
      )
    }
  }, [router.query.hit, router.pathname, router])

  const [debouncedQuery] = useDebounce(searchQuery, 300)

  const { typebots } = useTypebots({
    workspaceId: workspace?.id,
    // Omitting folderId to get all typebots (Deep Search)
    onError: () => {},
  })

  const searchResults = useMemo(() => {
    if (!typebots || debouncedQuery.trim().length === 0) return []
    const normalizedQuery = debouncedQuery.toLowerCase().trim()
    return typebots.filter((typebot) =>
      typebot.name.toLowerCase().includes(normalizedQuery)
    )
  }, [typebots, debouncedQuery])

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false)
    setSearchQuery('')
  }, [])

  // Clear highlight after 4 seconds
  useEffect(() => {
    if (!highlightedTypebotId) return
    const timer = setTimeout(() => setHighlightedTypebotId(null), 4000)
    return () => clearTimeout(timer)
  }, [highlightedTypebotId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        const activeElement = document.activeElement
        const isInput =
          activeElement?.tagName === 'INPUT' ||
          activeElement?.tagName === 'TEXTAREA' ||
          (activeElement as HTMLElement)?.isContentEditable

        if (
          isInput &&
          activeElement !== document.getElementById('dashboard-search-input')
        ) {
          return
        }

        e.preventDefault()
        setIsSearchOpen(true)
      }

      if (e.key === 'Escape' && isSearchOpen) {
        closeSearch()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSearchOpen, closeSearch])

  return (
    <dashboardSearchContext.Provider
      value={{
        isSearchOpen,
        setIsSearchOpen,
        searchQuery,
        setSearchQuery,
        searchResults,
        closeSearch,
        highlightedTypebotId,
        setHighlightedTypebotId,
      }}
    >
      {children}
    </dashboardSearchContext.Provider>
  )
}

export const useDashboardSearch = () => useContext(dashboardSearchContext)
