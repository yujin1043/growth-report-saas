import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json()

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: `당신은 미술학원의 따뜻한 선생님입니다.
학부모님께 보낼 일일 수업 메시지를 작성합니다.

# 규칙
- 2-4문장으로 간결하게
- 친근하고 따뜻한 톤
- 이모지 1-2개 자연스럽게 포함
- 카카오톡에 바로 붙여넣을 수 있는 형태
- "~했어요", "~했습니다" 등 자연스러운 종결어미 사용
- 학생 이름은 주어진 형태 그대로 사용`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 150
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('OpenAI Error:', error)
      return NextResponse.json({ error: 'AI 생성 실패' }, { status: 500 })
    }

    const data = await response.json()
    const message = data.choices[0].message.content.trim()

    return NextResponse.json({ message })

  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}