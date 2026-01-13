import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentName, studentAge, className, teacherMemo, parentRequest, imageBeforeBase64, imageAfterBase64 } = body

    // 이름에서 성 제거 (2글자면 그대로, 3글자 이상이면 성 제거)
    const firstName = studentName.length >= 3 ? studentName.slice(1) : studentName
    const nameWithSuffix = firstName + '이는'

    // 연령대 판별
    const age = parseInt(studentAge)
    let ageGroup = ''
    let ageGuideline = ''
    
    if (age <= 7) {
      ageGroup = '유치부(5-7세)'
      ageGuideline = `
- 기초 용어만 사용: 비례, 형태, 구성, 색감
- 발달 언어 필수 포함: 손의 힘, 시도, 용기, 호기심, 조심조심, 색 선택 과정
- 물감 사용 발달 묘사 필수 (물 양 조절, 번짐, 맑게 칠하기 등)
- 짧고 직관적인 문장
- 금지: 입체감, 명도 대비, 조형성 등 고급 용어`
    } else if (age <= 10) {
      ageGroup = '초등 저학년(8-10세)'
      ageGuideline = `
- 중급 용어 사용 가능: 선의 안정감, 색 조합, 화면 흐름, 비례
- "집중/시도/확장" 중심 표현
- 과정 중심 묘사: 선의 안정감, 빈틈 없는 채색
- 금지: 레이어링, 빛의 온도감 등 고급 용어`
    } else {
      ageGroup = '초등 고학년(11세 이상)'
      ageGuideline = `
- 고급 용어 사용 가능: 명암 대비, 빛 방향, 원근감, 구도, 질감, 레이어링
- 사고력/해석력/의도 있는 표현 중심
- 기술적·단계적 발전 묘사 필수
- 구체적인 지도 방향 제시 필수`
    }

    const systemPrompt = `당신은 그리마 미술학원의 따뜻하고 친근한 담당 선생님입니다.
학부모님께 보내는 성장 리포트를 작성합니다.

# 중요: 이미지 분석
- 첨부된 두 이미지는 학생의 [이전 작품]과 [최근 작품]입니다.
- 두 작품을 직접 비교하여 형태, 색채, 표현의 변화와 성장을 구체적으로 분석해주세요.
- 이미지에서 관찰되는 구체적인 요소(색상, 형태, 구도, 디테일 등)를 언급해주세요.

# 말투 및 톤
- 친근하고 따뜻한 선생님 말투
- 학생 이름은 반드시 "${nameWithSuffix}" 형태로 사용 (예: 주빈이는, 서연이는)
- 절대 "${studentName} 학생은", "${studentName}은/는" 형태 사용 금지
- 문장 끝: ~했어요, ~보여요, ~있어요, ~좋았어요, ~느껴졌어요
- 마치 학부모님과 대화하듯 자연스럽게

# 문장 분량 (필수!)
- 각 섹션 반드시 3문장 이상 작성
- 한 문장은 30~50자 정도
- 이미지에서 관찰한 구체적인 내용과 교사 메모 내용 모두 반영

# 핵심 원칙: Warm Logic
- 평가가 아닌 관찰 중심
- 결과보다 과정 중심 (시도·탐색·변화 묘사)
- 감정 추정 금지, 행동 기반 감정 묘사

# 절대 금지 표현
- "잘했어요", "못했어요", "훌륭해요", "대단해요"
- "다른 친구보다", "또래보다"
- "너무", "정말", "완벽해요"
- "~같아요", "~듯해요", "~것 같습니다"

# 현재 학생 연령대: ${ageGroup}
${ageGuideline}

# 지도 방향 작성 규칙
- 반드시 "~방향으로 지도하겠습니다", "~할 수 있도록 도와드리겠습니다" 형태로 종결
- 이미지 분석을 바탕으로 구체적인 다음 단계 제시`

    const userPrompt = `아래 정보와 첨부된 이미지를 바탕으로 학부모님께 보내는 따뜻한 성장 리포트를 작성해주세요.

## 학생 정보
- 이름: ${studentName} (리포트에서는 "${nameWithSuffix}" 형태로만 사용)
- 나이: ${studentAge}세
- 반: ${className}

## 첨부 이미지
- 첫 번째 이미지: 이전 작품
- 두 번째 이미지: 최근 작품
→ 두 작품을 비교하여 성장과 변화를 구체적으로 분석해주세요.

## 교사 관찰 메모
${teacherMemo}

${parentRequest ? `## 학부모 요청사항\n${parentRequest}\n(이 내용을 [표현] 또는 [지도방향]에 자연스럽게 반영해주세요)` : ''}

## 출력 형식 (JSON)
반드시 아래 JSON 형식으로만 응답하세요. 각 항목은 반드시 3문장 이상 작성하세요.
이미지에서 관찰한 구체적인 내용을 포함해주세요.
절대로 [형태], [색채] 등의 태그를 붙이지 마세요. 바로 내용으로 시작하세요.

{
  "content_form": "이전 작품과 최근 작품을 비교하여 ${nameWithSuffix} 형태 표현 변화를 3문장 이상 작성. 선의 안정감, 비례, 크기, 구도 변화 등을 이미지에서 관찰한 내용으로 구체적으로.",
  "content_color": "이전 작품과 최근 작품을 비교하여 ${nameWithSuffix} 색채 표현 변화를 3문장 이상 작성. 색 선택, 배색, 채색 방식의 변화 등을 이미지에서 관찰한 내용으로 구체적으로.",
  "content_expression": "이전 작품과 최근 작품을 비교하여 ${nameWithSuffix} 표현력 변화를 3문장 이상 작성. 주제 표현, 디테일, 이야기 구성의 변화 등.",
  "content_strength": "${nameWithSuffix} 강점 2-3문장. 이미지와 교사 메모를 바탕으로 성향과 미술적 특성을 결합한 긍정적 관찰.",
  "content_attitude": "${nameWithSuffix} 수업 태도와 감성 3문장 이상. 교사 메모를 바탕으로 구체적 행동 묘사.",
  "content_direction": "3문장 이상. 이미지 분석을 바탕으로 앞으로의 구체적인 지도 계획. 반드시 '~방향으로 지도하겠습니다', '~할 수 있도록 도와드리겠습니다' 형태로 작성."
}`

    // 메시지 구성 (이미지 포함)
    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ]

    // 이미지가 있으면 Vision API 형식으로 구성
    if (imageBeforeBase64 && imageAfterBase64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: userPrompt },
          { 
            type: 'image_url', 
            image_url: { 
              url: imageBeforeBase64,
              detail: 'low'
            } 
          },
          { 
            type: 'image_url', 
            image_url: { 
              url: imageAfterBase64,
              detail: 'low'
            } 
          }
        ]
      })
    } else {
      messages.push({ role: 'user', content: userPrompt })
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
      })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('OpenAI Error:', JSON.stringify(error, null, 2))
      return NextResponse.json({ error: 'AI 생성 실패', details: error }, { status: 500 })
    }

    const data = await response.json()
    const content = data.choices[0].message.content

    // JSON 파싱
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const reportContent = JSON.parse(jsonMatch[0])
      
      // [형태], [색채] 등 태그 제거 (혹시 붙어있을 경우 대비)
      const cleanContent = {
        content_form: reportContent.content_form.replace(/^\[형태\]\s*/i, ''),
        content_color: reportContent.content_color.replace(/^\[색채\]\s*/i, ''),
        content_expression: reportContent.content_expression.replace(/^\[표현\]\s*/i, ''),
        content_strength: reportContent.content_strength.replace(/^\[강점\]\s*/i, ''),
        content_attitude: reportContent.content_attitude.replace(/^\[수업태도\]\s*/i, ''),
        content_direction: reportContent.content_direction.replace(/^\[지도방향\]\s*/i, '')
      }
      
      return NextResponse.json(cleanContent)
    }

    return NextResponse.json({ error: 'JSON 파싱 실패' }, { status: 500 })

  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}