import { NextRequest, NextResponse } from 'next/server'

// 간단한 in-memory rate limiter
const requestCounts = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT = 50
const RATE_WINDOW = 60 * 1000

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = requestCounts.get(ip)
  
  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_WINDOW })
    return true
  }
  
  if (record.count >= RATE_LIMIT) {
    return false
  }
  
  record.count++
  return true
}

// 타임아웃이 있는 fetch
async function fetchWithTimeout(url: string, options: RequestInit, timeout = 25000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

// 재시도 로직
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  maxRetries = 2,
  timeout = 25000
): Promise<Response> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeout)
      
      if (response.status === 429 || response.status >= 500) {
        const delay = Math.min(1000 * attempt, 3000)
        
        if (attempt < maxRetries) {
          console.log(`API 요청 재시도 ${attempt}/${maxRetries}, ${delay}ms 후 재시도`)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
      }
      
      return response
    } catch (error) {
      lastError = error as Error
      
      if ((error as Error).name === 'AbortError' && attempt < maxRetries) {
        console.log(`타임아웃 발생, 재시도 ${attempt}/${maxRetries}`)
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }
    }
  }
  
  throw lastError || new Error('최대 재시도 횟수 초과')
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown'
    
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        { status: 429 }
      )
    }

    const { prompt } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '유효하지 않은 요청입니다.' },
        { status: 400 }
      )
    }

    const response = await fetchWithRetry(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `미술학원 선생님으로서 학부모용 일일 수업 메시지를 작성합니다.

규칙:
- 정확히 5문장
- 친근하고 따뜻한 톤
- 마지막에 이모지 1개
- 150-200자 내외
- 바로 카카오톡에 붙여넣을 수 있는 형태`
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 300
        })
      },
      2,
      25000
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI Error:', response.status, errorData)
      
      if (response.status === 429) {
        return NextResponse.json(
          { error: 'AI 서비스가 일시적으로 바쁩니다. 잠시 후 다시 시도해주세요.' },
          { status: 503 }
        )
      }
      
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'AI 서비스 인증 오류가 발생했습니다.' },
          { status: 500 }
        )
      }
      
      return NextResponse.json(
        { error: 'AI 생성에 실패했습니다. 다시 시도해주세요.' },
        { status: 500 }
      )
    }

    const data = await response.json()
    
    if (!data.choices || !data.choices[0]?.message?.content) {
      return NextResponse.json(
        { error: 'AI 응답이 올바르지 않습니다.' },
        { status: 500 }
      )
    }
    
    const message = data.choices[0].message.content.trim()

    return NextResponse.json({ message })

  } catch (error) {
    console.error('Error:', error)
    
    if ((error as Error).name === 'AbortError') {
      return NextResponse.json(
        { error: 'AI 응답 시간이 초과되었습니다. 다시 시도해주세요.' },
        { status: 504 }
      )
    }
    
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 }
    )
  }
}