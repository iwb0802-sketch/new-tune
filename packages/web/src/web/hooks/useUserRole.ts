import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'

type Role = 'free' | 'pro' | 'admin'

export function useUserRole(userId?: string | null) {
  const [role, setRole] = useState<Role>('free')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setRole('free'); setLoading(false); return }

    setLoading(true)
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => {
        if (data?.role) setRole(data.role as Role)
        else setRole('free')
        setLoading(false)
      })
  }, [userId])

  return {
    role,
    loading,
    isPro: role === 'pro' || role === 'admin',
    isAdmin: role === 'admin',
  }
}
