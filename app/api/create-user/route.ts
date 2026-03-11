import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, name, role, branch_id, status, phone, class_ids } = body

    // 유효성 검증
    if (!email || !password || !name) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: '비밀번호는 6자 이상이어야 합니다.' }, { status: 400 })
    }

    // ★ Service Role Key로 서버 전용 클라이언트 생성
    // admin 세션에 영향을 주지 않음
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 1. 사용자 생성
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    })

    if (authError) {
      return NextResponse.json({ error: '계정 생성 실패: ' + authError.message }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: '계정 생성에 실패했습니다.' }, { status: 500 })
    }

    // 2. 프로필 생성
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        name,
        email,
        role: role || 'teacher',
        branch_id: branch_id || null,
        status: status || 'active',
        phone: phone || null
      })

    if (profileError) {
      return NextResponse.json({ error: '프로필 저장 실패: ' + profileError.message }, { status: 500 })
    }

    // 3. 담당반 배정 (teacher인 경우)
    if (class_ids && class_ids.length > 0 && role === 'teacher') {
      const teacherClassesInsert = class_ids.map((classId: string) => ({
        teacher_id: authData.user.id,
        class_id: classId
      }))

      const { error: classError } = await supabaseAdmin
        .from('teacher_classes')
        .insert(teacherClassesInsert)

      if (classError) {
        console.error('Class assignment error:', classError)
      }
    }

    return NextResponse.json({ success: true, userId: authData.user.id })

  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
