import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

// ✅ 개선: 타임아웃 + 상세 에러 메시지
const TIMEOUT_MS = 60000 // 60초

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      studentName,
      studentAge,
      className,
      teacherMemo,
      parentRequest,
      imageBeforeBase64,
      imageAfterBase64
    } = body

    if (!studentName) {
      return NextResponse.json({ error: '학생 이름이 필요합니다.' }, { status: 400 })
    }

    const firstName = studentName.length >= 3 ? studentName.slice(1) : studentName
    const lastChar = firstName.charCodeAt(firstName.length - 1)
    const hasBatchim = (lastChar - 0xAC00) % 28 !== 0
    const nameNun = hasBatchim ? firstName + '이는' : firstName + '는'
    const nameGa = hasBatchim ? firstName + '이가' : firstName + '가'

    const systemPrompt = `당신은 미술학원 전문 교사입니다. 학생의 작품 이미지를 분석하여 학부모에게 전달할 성장 리포트를 작성합니다.
    
작성 규칙:
- 각 항목은 반드시 3문장 이상 작성하세요.
- 이미지에서 관찰한 구체적인 내용을 포함해주세요.
- 절대로 [형태], [색채] 등의 태그를 붙이지 마세요. 바로 내용으로 시작하세요.
- 학생 이름은 반드시 성 없이 "${firstName}" 만 사용하세요
- 절대 풀네임 "${studentName}"을 사용하지 마세요
- "동료" 대신 "친구", "협력" 대신 "함께 잘 어울리며", "피드백" 대신 "이야기", "몰입" 대신 "집중"을 사용하세요
- 학부모가 읽기 편한 따뜻하고 친근한 말투로 작성하세요`

    const userPrompt = `학생 정보:
- 이름: ${firstName} (${nameNun})
- 나이: ${studentAge}세
- 반: ${className || '미지정'}
- 교사 메모: ${teacherMemo}
${parentRequest ? `- 학부모 요청사항: ${parentRequest}` : ''}

아래 JSON 형식으로만 응답해주세요 (다른 텍스트 없이):
{
  "content_form": "이전 작품과 최근 작품을 비교하여 ${nameNun} 형태 표현 변화를 3문장 이상 작성. 선의 안정감, 비례, 크기, 구도 변화 등을 이미지에서 관찰한 내용으로 구체적으로.",
  "content_color": "이전 작품과 최근 작품을 비교하여 ${nameNun} 색채 표현 변화를 3문장 이상 작성. 색 선택, 배색, 채색 방식의 변화 등을 이미지에서 관찰한 내용으로 구체적으로.",
  "content_expression": "이전 작품과 최근 작품을 비교하여 ${nameNun} 표현력 변화를 3문장 이상 작성. 주제 표현, 디테일, 이야기 구성의 변화 등.",
  "content_strength": "${nameNun} 강점 2-3문장. 이미지와 교사 메모를 바탕으로 성향과 미술적 특성을 결합한 긍정적 관찰.",
  "content_attitude": "${nameNun} 수업 태도와 감성 3문장 이상. 교사 메모를 바탕으로 구체적 행동 묘사.",
  "content_direction": "3문장 이상. 이미지 분석을 바탕으로 앞으로의 구체적인 지도 계획. 반드시 '~방향으로 지도하겠습니다', '~할 수 있도록 도와드리겠습니다' 형태로 작성."
}`

    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ]

    if (imageBeforeBase64 && imageAfterBase64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: imageBeforeBase64, detail: 'low' } },
          { type: 'image_url', image_url: { url: imageAfterBase64, detail: 'low' } }
        ]
      })
    } else {
      messages.push({ role: 'user', content: userPrompt })
    }

    // ✅ 타임아웃 적용
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.75,
          max_tokens: 2000
        }),
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeoutId)
    }

    // ✅ OpenAI 에러 상세 처리
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenAI Error:', response.status, JSON.stringify(errorData))

      if (response.status === 429) {
        return NextResponse.json(
          { error: 'AI 요청이 잠시 과부하 상태입니다. 30초 후 다시 시도해주세요.' },
          { status: 429 }
        )
      }
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'AI 인증 오류입니다. 관리자에게 문의해주세요.' },
          { status: 500 }
        )
      }
      if (response.status >= 500) {
        return NextResponse.json(
          { error: 'AI 서버가 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요.' },
          { status: 502 }
        )
      }

      return NextResponse.json(
        { error: 'AI 리포트 생성에 실패했습니다. 다시 시도해주세요.' },
        { status: 500 }
      )
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return NextResponse.json(
        { error: 'AI 응답이 비어 있습니다. 다시 시도해주세요.' },
        { status: 500 }
      )
    }

    // JSON 파싱
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.error('JSON 파싱 실패, 원본:', content)
      return NextResponse.json(
        { error: 'AI 응답 형식 오류입니다. 다시 시도해주세요.' },
        { status: 500 }
      )
    }

    try {
      const reportContent = JSON.parse(jsonMatch[0])
      const cleanField = (text: string) => {
        if (!text) return ''
        return text
          .replace(/^\[.*?\]\s*/i, '')
          .replaceAll(studentName + '이는', nameNun)
          .replaceAll(studentName + '은', firstName + (hasBatchim ? '이는' : '는'))
          .replaceAll(studentName + '는', firstName + (hasBatchim ? '이는' : '는'))
          .replaceAll(studentName, firstName)
      }

      const cleanContent = {
        content_form: cleanField(reportContent.content_form),
        content_color: cleanField(reportContent.content_color),
        content_expression: cleanField(reportContent.content_expression),
        content_strength: cleanField(reportContent.content_strength),
        content_attitude: cleanField(reportContent.content_attitude),
        content_direction: cleanField(reportContent.content_direction)
      }
      return NextResponse.json(cleanContent)
    } catch (parseError) {
      console.error('JSON parse error:', parseError, jsonMatch[0])
      return NextResponse.json(
        { error: 'AI 응답 파싱 오류입니다. 다시 시도해주세요.' },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('generate-report error:', error)

    if ((error as Error).name === 'AbortError') {
      return NextResponse.json(
        { error: 'AI 응답 시간이 초과되었습니다 (60초). 네트워크 상태를 확인 후 다시 시도해주세요.' },
        { status: 504 }
      )
    }

    return NextResponse.json(
      { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 }
    )
  }
}