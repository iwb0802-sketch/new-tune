# 시험용 페이지 포팅 (newtun → managed stack) — B: 전체 1:1

## 결정
- 기존 Supabase 프로젝트 재연결 (anon key 공개, 소스에 있음) → 클라우드 세션/프로필/권한 데이터 유지
- `/manual` 탭 라벨 수동→시험, 페이지를 StrobeManualPage(구버전)으로 교체
- 신버전도 함께 포팅 → `/strobe-manual-2` 라우트 (페이지 간 상호 링크 유지)
- `/auth` 라우트 추가 (AuthPage), 미로그인 시 시험페이지→/auth 리다이렉트
- 라우터: @tanstack/react-router → wouter (navigate({to}) → navigate(), Link to→href)

## 새 npm deps (설치됨)
- @supabase/supabase-js, sonner, @radix-ui/react-label

## 진행
- [x] 소스 복사 (hooks, features/tuner, components/tuner, lib/tuner, integrations/supabase, ui: card/input/label/alert)
- [x] StrobeManualPage2 복사
- [ ] styles.css 커스텀 토큰 추가 (precision/in-tune/warn/off/strobe + soft/foreground)
- [ ] StrobeManualPage 라우터 변환 + 미로그인 리다이렉트 /auth
- [ ] StrobeManualPage2 라우터 변환
- [ ] AuthPage 로그인 성공 시 /manual 리다이렉트 추가
- [ ] app.tsx: 라우트 추가(/manual→구버전, /strobe-manual-2→신버전, /auth→AuthPage) + <Toaster/>
- [ ] Layout.tsx: 수동→시험 라벨
- [ ] tsc --noEmit + vite build 통과
- [ ] commit/push/deploy (Vercel) + READY 확인

## 빌드/배포 패턴
- typecheck: cd packages/web && bunx tsc --noEmit
- build: (cd packages/web && bunx vite build)
- push: source .git-push.env → git push https://x-access-token:${GITHUB_TOKEN}@github.com/iwb0802-sketch/new-tune.git main
- deploy: POST vercel v13/deployments (project prj_ViHYuJaYnqJ0mPwpwg8mhGmfM1vM, repoId 1310046063)

## ✅ 완료 (2026-07-29)
- tsc/vite build clean, 런타임 콘솔 에러 0 (AuthPage useEffect/useLocation import 누락 수정)
- orphan pages/manual.tsx 삭제
- 커밋 d55b620, iwb0802-sketch/new-tune main 푸시 완료
- Vercel dpl_3RbhALf7TcWXeyqUDLDe6uGJdgnj → READY
- 프로덕션 new-tune-desktop.vercel.app /auth /manual /strobe-manual-2 모두 200
