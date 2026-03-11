// lib/cache.ts
// 간단한 메모리 캐시 - 같은 세션 내 반복 Supabase 요청 방지

const cache = new Map<string, { data: any; timestamp: number }>()

/**
 * 캐시에서 데이터 조회
 * @param key 캐시 키
 * @param ttlMs 유효시간 (기본 30초)
 */
export function getCached<T>(key: string, ttlMs: number = 30000): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > ttlMs) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

/**
 * 캐시에 데이터 저장
 */
export function setCache(key: string, data: any) {
  cache.set(key, { data, timestamp: Date.now() })
}

/**
 * 캐시 무효화
 * @param prefix 특정 prefix로 시작하는 키만 삭제 (없으면 전체 삭제)
 */
export function invalidateCache(prefix?: string) {
  if (!prefix) {
    cache.clear()
    return
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}

/**
 * 캐시된 Supabase 쿼리 실행
 * @example
 * const classes = await cachedQuery('classes_list', 60000, () => 
 *   supabase.from('classes').select('id, name').order('name')
 * )
 */
export async function cachedQuery<T>(
  key: string, 
  ttlMs: number, 
  queryFn: () => Promise<{ data: T | null; error: any }>
): Promise<T | null> {
  const cached = getCached<T>(key, ttlMs)
  if (cached) return cached

  const { data, error } = await queryFn()
  if (!error && data) {
    setCache(key, data)
  }
  return data
}
