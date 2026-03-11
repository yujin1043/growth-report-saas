// ============================================================
// 그리마노트 Service Worker - v2 (강제 업데이트 지원)
// ============================================================
// 배포할 때마다 CACHE_VERSION 번호를 올리면 자동 업데이트됩니다.
const CACHE_VERSION = 2
const CACHE_NAME = `grimanote-v${CACHE_VERSION}`

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
  // 새 서비스워커 즉시 활성화 (대기 건너뛰기)
  self.skipWaiting()
})

// 활성화: 이전 버전 캐시 모두 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    }).then(() => {
      // 모든 클라이언트에 즉시 적용
      return self.clients.claim()
    }).then(() => {
      // 모든 열린 탭/앱에 업데이트 알림 전송
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: CACHE_VERSION
          })
        })
      })
    })
  )
})

// 강제 업데이트 메시지 수신
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Fetch 이벤트
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // ★ chrome-extension 등 http가 아닌 스킴은 무시 (에러 방지)
  if (!url.protocol.startsWith('http')) {
    return
  }

  // ★ API 요청 & Supabase 인증은 절대 캐시하지 않음 (로그인 문제 방지)
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase')
  ) {
    event.respondWith(networkOnly(request))
    return
  }

  // Next.js 정적 리소스는 캐시 우선
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  // 페이지 네비게이션: 네트워크 우선 + 오프라인 폴백
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request))
    return
  }

  // 기타: 네트워크 우선
  event.respondWith(networkFirst(request))
})

// -- 캐싱 전략 함수들 --

// 네트워크만 사용 (API/인증용 - 캐시 절대 안 함)
async function networkOnly(request) {
  try {
    return await fetch(request)
  } catch {
    return new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

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
    if (response.ok && request.method === 'GET') {
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
    return caches.match('/offline') || new Response('오프라인 상태입니다', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    })
  }
}
