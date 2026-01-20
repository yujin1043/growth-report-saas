import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { studentName, studentAge, subject, materials, progressStatus, teacherMemo } = await request.json()

    if (!studentName || !subject) {
      return NextResponse.json(
        { error: '유효하지 않은 요청입니다.' },
        { status: 400 }
      )
    }

    // 이름에서 성 제거
    const firstName = studentName.length >= 3 ? studentName.slice(1) : studentName
    
    // 받침 유무 확인
    const hasFinalConsonant = (str: string) => {
      const lastChar = str.charAt(str.length - 1)
      const code = lastChar.charCodeAt(0)
      if (code >= 0xAC00 && code <= 0xD7A3) {
        return (code - 0xAC00) % 28 !== 0
      }
      return false
    }
    
    const hasJongseong = hasFinalConsonant(firstName)
    const nameNun = firstName + (hasJongseong ? '이는' : '는')
    const nameMan = firstName + (hasJongseong ? '이만의' : '만의')

    // 연령대 판별
    const age = parseInt(studentAge)
    let ageGroup = ''
    let ageGuideline = ''
    
    if (age <= 7) {
      ageGroup = '유치부(7세 이하)'
      ageGuideline = `- 쉬운 표현 사용
- 시도, 용기, 호기심, 즐거움 중심 묘사
- 기초 용어만: 색깔, 모양, 크기
- 금지: 명암, 구도, 레이어링 등 전문 용어`
    } else if (age <= 10) {
      ageGroup = '초등 저학년(8-10세)'
      ageGuideline = `- 중급 용어 사용 가능: 색감, 형태, 배경, 표현
- 집중, 시도, 확장, 관찰 중심 묘사
- 과정 중심: 선의 안정감, 색의 조화
- 금지: 레이어링, 명도 대비 등 고급 용어`
    } else {
      ageGroup = '초등 고학년(11세 이상)'
      ageGuideline = `- 고급 용어 사용 가능: 명암, 구도, 원근감, 질감, 레이어링, 웻온드라이
- 기법, 의도, 해석 중심 묘사
- 기술적 표현: 붓터치, 번짐, 그라데이션, 색의 깊이
- 학생의 의도와 표현 방식 구체적으로 설명`
    }

    // 진행 상태 텍스트
    let progressText = ''
    if (progressStatus === 'started') {
      progressText = '오늘 처음 시작한 작품입니다.'
    } else if (progressStatus === 'none') {
      progressText = '작품을 열심히 진행하고 있습니다.'
    } else if (progressStatus === 'completed') {
      progressText = '오늘 작품을 완성하였습니다.'
    }

    const systemPrompt = `당신은 그리마 미술학원의 전문적이고 따뜻한 선생님입니다.
학부모님께 보내는 일일 수업 메시지를 작성합니다.

# 작성 규칙
- 5문장 이상, 200-350자
- 미술 전문 용어 적절히 사용 (연령에 맞게)
- 작품의 구체적인 특징 언급
- 학생의 시도와 과정 중심 묘사
- 진행 상태에 맞는 마무리
- 마지막에 이모지 1개
- 카카오톡에 바로 붙여넣을 수 있는 형태

# 학생 이름 사용 규칙
- "${nameNun}" 또는 "${nameMan}" 형태로 자연스럽게 사용
- 전체 이름(${studentName}) 사용 금지
- 이름은 처음에 1회만 사용, 이후는 생략

# 현재 학생 연령대: ${ageGroup}
${ageGuideline}

# 절대 금지
- "잘했어요", "훌륭해요", "대단해요", "최고예요"
- "~같아요", "~듯해요", "~것 같습니다"
- 평가하는 표현 대신 관찰/묘사 표현 사용`

    const userPrompt = `아래 정보를 바탕으로 학부모님께 보내는 일일 수업 메시지를 작성해주세요.

## 학생 정보
- 이름: ${firstName}
- 나이: ${studentAge}세

## 오늘 수업 내용
- 주제: ${subject}
- 재료: ${materials || '다양한 재료'}
- 진행 상태: ${progressText}

## 선생님 관찰 메모
${teacherMemo || '(메모 없음)'}

위 내용을 바탕으로 5문장 이상의 따뜻하고 전문적인 메시지를 작성해주세요.
선생님 메모에 있는 구체적인 내용(기법, 표현, 특징)을 반드시 반영해주세요.`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000)

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.error('OpenAI Error:', response.status)
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
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
