// src/features/typebot/hooks/useTypebotEditQueue.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { Router } from 'next/router'
import { trpc } from '@/lib/trpc'

type QueueUser = {
  userId: string
  position: number // 1 = editor
  userEmail: string | null
  userName: string | null
}

type UseTypebotEditQueueArgs = {
  typebotId?: string
  userEmail?: string | null
  currentUserMode: 'guest' | 'read' | 'write'
}

type UseTypebotEditQueueReturn = {
  queuePosition: number | null
  isEditor: boolean
  editingQueue: QueueUser[]
  isReadOnlyDueToEditing: boolean
  canEditNow: boolean
  dismissEditNotification: () => void
  claimEditing: (typebotId: string) => Promise<void>
  releaseEditing: (props: {
    typebotId: string
  }) => Promise<{ success: boolean }>
  joinQueue: (typebotId: string) => Promise<void>
  leaveQueue: (typebotId: string) => Promise<void>
  refetchQueue: () => Promise<void>
}

/**
 * Lógica de fila/edição extraída:
 * - NÃO usa mais typebot.isBeingEdited / typebot.editingUserEmail
 * - Determina readonly com base no snapshot da fila:
 *    editor = quem está na posição 0 (ou flag isEditor do backend)
 * - Heartbeat a cada 5s:
 *    * se for editor → claim para renovar
 *    * se estiver na fila → heartbeat para manter vivo; se posição 1, tenta claim
 *    * se readonly por outro editor → apenas atualiza snapshot
 * - Entra na fila quando necessário e sai ao desmontar
 * - Libera edição de forma robusta em unload/route change (sendBeacon fallback)
 */
export function useTypebotEditQueue({
  typebotId,
  userEmail,
  currentUserMode,
}: UseTypebotEditQueueArgs): UseTypebotEditQueueReturn {
  console.log('useTypebotEditQueue', { typebotId, userEmail, currentUserMode })
  const [wasInReadonlyMode, setWasInReadonlyMode] = useState(false)
  const [canEditNow, setCanEditNow] = useState(false)

  // queries/mutations
  const { data: queueData, refetch: refetchQueue } =
    trpc.typebot.getEditingQueue.useQuery(
      { typebotId: typebotId as string },
      { enabled: Boolean(typebotId) }
    )

  const { mutateAsync: _claimEditing } =
    trpc.typebot.claimEditingStatus.useMutation()
  const { mutateAsync: _releaseEditing } =
    trpc.typebot.releaseEditingStatus.useMutation()
  const { mutateAsync: _joinQueue } =
    trpc.typebot.joinEditingQueue.useMutation()
  const { mutateAsync: _leaveQueue } =
    trpc.typebot.leaveEditingQueue.useMutation()
  const { mutateAsync: _heartbeat } =
    trpc.typebot.editingHeartbeat.useMutation()

  // estado derivado
  const queuePosition = queueData?.position ?? null // agora backend já entrega 1=editor
  const isEditor = Boolean(queueData?.isEditor)
  const editingQueue: QueueUser[] =
    queueData?.queue.map((q) => ({
      userId: q.userId,
      position: q.position,
      userEmail: q.userEmail ?? null,
      userName: q.userName ?? null,
    })) ?? []
  const someoneEditingNow = !!queueData?.editorEmail
  // Se backend ainda não retornou minha posição (join pendente) mas existe editor, força readonly.
  // Caso eu esteja na fila (position>1) backend enviará position>1 e !isEditor.
  const isReadOnlyDueToEditing = !isEditor && someoneEditingNow
  if (process.env.NODE_ENV !== 'production') {
    console.log('[edit-queue] derived state', {
      editorEmail: queueData?.editorEmail,
      queuePosition,
      isEditor,
      isReadOnlyDueToEditing,
    })
  }

  // notificação "pode editar agora"
  useEffect(() => {
    if (isReadOnlyDueToEditing) {
      setWasInReadonlyMode(true)
      setCanEditNow(false)
    } else if (wasInReadonlyMode) {
      setCanEditNow(true)
    }
  }, [isReadOnlyDueToEditing, wasInReadonlyMode])

  const dismissEditNotification = useCallback(() => {
    setCanEditNow(false)
    setWasInReadonlyMode(false)
  }, [])

  // entrar na fila automaticamente quando abrir e houver editor ativo
  const [joinedRef, setJoinedRef] = useState(false)
  const claimedRef = useRef(false)
  useEffect(() => {
    if (!typebotId || !userEmail) return
    console.log('someoneEditingNow', someoneEditingNow)
    console.log('isEditor', isEditor)
    console.log('queuePosition', queuePosition)

    // Estratégia nova:
    // 1. Se não tenho posição e não sou editor -> sempre tentar join (fila pode estar vazia)
    // 2. Se já existe editor (someoneEditingNow) continua válido (join também cobre)
    const shouldJoin = !isEditor && queuePosition == null
    console.log('shouldJoin?', { shouldJoin, joined: joinedRef })
    if (shouldJoin && !joinedRef) {
      setJoinedRef(true)
      console.log('joining queue...')
      _joinQueue({ typebotId })
        .then(() => refetchQueue())
        .catch((e) => {
          console.log('[edit-queue] join erro', e)
          setJoinedRef(false) // libera nova tentativa futura
        })
    }

    // Novo: se usuário é write e não está nem na fila nem é editor -> tentar claim direto (fila vazia)
    if (
      currentUserMode === 'write' &&
      !isEditor &&
      queuePosition == null &&
      !claimedRef.current &&
      !someoneEditingNow &&
      !shouldJoin // evita duplicar tentativa na mesma render
    ) {
      claimedRef.current = true
      _claimEditing({ typebotId })
        .then(() => refetchQueue())
        .catch((err) => {
          console.log('[edit-queue] claim falhou, fallback join', err)
          // fallback: se claim falhar (condição de corrida) tentar join
          _joinQueue({ typebotId })
            .then(() => refetchQueue())
            .catch((e) => console.log('[edit-queue] fallback join erro', e))
        })
    }
  }, [
    typebotId,
    userEmail,
    someoneEditingNow,
    isEditor,
    queuePosition,
    currentUserMode,
    _joinQueue,
    _claimEditing,
    refetchQueue,
  ])

  // heartbeat & tentativa de claim quando estou na cabeça da fila (pos 1 aguardando liberação)
  useEffect(() => {
    if (!typebotId || !userEmail) return
    const interval = setInterval(async () => {
      try {
        if (isEditor) {
          await _claimEditing({ typebotId })
        } else if (queuePosition != null) {
          await _heartbeat({ typebotId })
          // Agora: posição 2 é primeiro aguardando (1 é editor)
          if (queuePosition === 2) {
            // tentar pegar a "coroa" quando liberar
            await _claimEditing({ typebotId }).catch(() => {})
          }
        } else if (isReadOnlyDueToEditing) {
          await refetchQueue()
        }
      } catch {
        /* silencioso */
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [
    typebotId,
    userEmail,
    isEditor,
    queuePosition,
    isReadOnlyDueToEditing,
    _claimEditing,
    _heartbeat,
    refetchQueue,
  ])

  // sair da fila no unmount
  useEffect(() => {
    return () => {
      if (typebotId && userEmail) {
        _leaveQueue({ typebotId }).catch(() => {})
        setJoinedRef(false)
      }
    }
  }, [typebotId, userEmail, _leaveQueue])

  // release helpers
  const releaseEditing = useCallback(
    async ({ typebotId }: { typebotId: string }) => {
      try {
        await _releaseEditing({ typebotId })
        return { success: true }
      } catch (e) {
        return { success: false }
      }
    },
    [_releaseEditing]
  )

  // release “sync-ish” para beforeunload/route change (sendBeacon → fetch keepalive)
  const releaseEditingSync = useCallback((id: string) => {
    const tryBeacon = () => {
      if (!navigator.sendBeacon) return false
      const url = `/api/typebots/${id}/release-editing`
      return navigator.sendBeacon(url, new Blob([''], { type: 'text/plain' }))
    }
    const ok = tryBeacon()
    if (ok) return
    try {
      fetch(`/api/typebots/${id}/release-editing`, {
        method: 'POST',
        keepalive: true,
      }).catch(() => {})
    } catch {
      /* noop */
    }
  }, [])

  // integrar com lifecycle da página/rota
  useEffect(() => {
    if (!typebotId || !userEmail) return

    const onUnload = () => releaseEditingSync(typebotId)
    const onRoute = () => releaseEditingSync(typebotId)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') releaseEditingSync(typebotId)
    }

    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onUnload)
    document.addEventListener('visibilitychange', onVisibility)
    Router.events.on('routeChangeStart', onRoute)

    return () => {
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
      document.removeEventListener('visibilitychange', onVisibility)
      Router.events.off('routeChangeStart', onRoute)
      releaseEditingSync(typebotId)
    }
  }, [typebotId, userEmail, releaseEditingSync])

  // wrappers públicos simples
  const claimEditing = useCallback(
    async (id: string) => {
      await _claimEditing({ typebotId: id })
      await refetchQueue()
    },
    [_claimEditing, refetchQueue]
  )

  const joinQueue = useCallback(
    async (id: string) => {
      await _joinQueue({ typebotId: id })
      await refetchQueue()
    },
    [_joinQueue, refetchQueue]
  )

  const leaveQueue = useCallback(
    async (id: string) => {
      await _leaveQueue({ typebotId: id })
      await refetchQueue()
    },
    [_leaveQueue, refetchQueue]
  )

  // refetch wrapper que garante assinatura Promise<void>
  const refetchQueueSafe = useCallback(async () => {
    try {
      await refetchQueue()
    } catch {
      /* silencioso */
    }
  }, [refetchQueue])

  return {
    queuePosition,
    isEditor,
    editingQueue,
    isReadOnlyDueToEditing,
    canEditNow,
    dismissEditNotification,
    claimEditing,
    releaseEditing,
    joinQueue,
    leaveQueue,
    refetchQueue: refetchQueueSafe,
  }
}
