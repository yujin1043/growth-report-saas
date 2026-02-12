const CACHE_NAME = 'grimanote-v1'

// 앱 셸(App Shell) - 반드시 캐시할 정적 리소스
const PRECACHE_URLS = [
  '/dashboard',
  '/login',
  '/offline',
]

// 설치: 프리캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS)
    })
  )
  // 새 서비스워커 즉시 활성화
  self.skipWaiting()
})

// 활성화: 이전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  // 모든 클라이언트에 즉시 적용
  self.clients.claim()
})

// Fetch: Network First 전략 (API), Cache First 전략 (정적 리소스)
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // API 요청 & Supabase 요청은 항상 네트워크 우선
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase')
  ) {
    event.respondWith(networkFirst(request))
    return
  }

  // Next.js 내부 리소스 (_next/static)는 캐시 우선
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  // 나머지 페이지 요청: 네트워크 우선 + 오프라인 폴백
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request))
    return
  }

  // 기타: 네트워크 우선
  event.respondWith(networkFirst(request))
})

// -- 캐싱 전략 함수들 --

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Offline', { status: 503 })
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    return cached || new Response('Offline', { status: 503 })
  }
}

async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    // 오프라인 페이지 폴백
    return caches.match('/offline') || new Response('오프라인 상태입니다', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
}
