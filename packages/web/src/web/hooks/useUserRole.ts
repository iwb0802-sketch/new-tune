import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

type Role = 'free' | 'pro' | 'admin'

export function useUserRole(userId?: string | null) {
  // resolvedFor: 이 role 값이 어떤 userId에 대해 확정된 것인지 추적.
  // userId가 바뀐 직후엔 resolvedFor !== userId 이므로 loading=true로 취급 → stale 값으로 잘못 판단하는 것 방지.
  const [state, setState] = useState<{ resolvedFor: string | null | undefined; role: Role }>({
    resolvedFor: undefined,
    role: 'free',
  })

  useEffect(() => {
    if (!userId) {
      setState({ resolvedFor: userId, role: 'free' })
      return
    }
    let cancelled = false
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        setState({ resolvedFor: userId, role: (data?.role as Role) ?? 'free' })
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const resolved = state.resolvedFor === userId
  const role = resolved ? state.role : 'free'

  return {
    role,
    loading: !resolved,
    isPro: resolved && (role === 'pro' || role === 'admin'),
    isAdmin: resolved && role === 'admin',
  }
}
