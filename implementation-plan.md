# 수학 RPG 웹앱 구현 계획 (Implementation Plan)

## 1) 목표
- Firebase 기반 실시간 멀티플레이 수학 RPG 웹앱 구축
- `1모둠~5모둠` 서버, 서버당 최대 5명 동시 접속
- 2~7차시 범위 문제 기반 전투, 레벨업, 랭킹, 만렙 리포트 구현
- 관리자 전용 실시간 관제 페이지 제공

## 2) 기술 스택
- 프론트엔드: React + Vite + Phaser + Zustand
- 백엔드: Firebase Functions (게임 규칙/검증)
- 실시간 상태: Firebase Realtime Database
- 이력/분석: Cloud Firestore
- 인증/권한: Firebase Authentication (student/admin role)

## 3) 아키텍처
- Student Client
  - 로그인/캐릭터 선택/맵 이동/전투/랭킹/리포트
- Admin Client
  - 모둠별 인원/학생별 활동/정오답 흐름 실시간 모니터링
- Firebase Functions
  - 입장 검증, 전투 판정, 레벨업 처리, 보상 지급, 만렙 종료 처리
- RTDB
  - 위치, 접속 상태, 랭킹 상태 등 실시간 반영 데이터
- Firestore
  - 활동 로그, 배틀 로그, 결과 리포트 영구 저장

## 4) 데이터 모델(요약)
- `users`: uid, role, displayName, createdAt
- `characters`: userId, animalType, appearanceTier, accessories
- `groupSessions`: groupId(1~5), userId, online, joinedAt, lastPosition
- `questions`: level(1~6), lesson(2~7), questionType(objective/subjective), prompt, choices, answer, explanation, sourceTag
- `progress`: userId, currentLevel, correctByLevel, totalKills, totalPlayTime
- `combatState`: userId, hp, wrongStreak, lastPenaltyAt
- `inventory`: userId, itemId, itemType, rarity, acquiredAt
- `battleLogs`: userId, questionId, isCorrect, durationMs, timestamp
- `activityLogs`: groupId, userId, eventType, payload, timestamp
- `rankings`: groupId, level, leaderboard[]

## 5) 기능 구현 순서

### 단계 1. 프로젝트 초기화
- Vite React 앱 생성
- Firebase 프로젝트/SDK 연결
- 환경변수 및 기본 라우팅 구성

### 단계 2. 인증/권한/모둠 입장
- 학생: 로그인 없이 닉네임 + 숫자 5자리 반코드로 입장
- 관리자: Google 로그인
- 역할(role) 분기 라우팅 및 반코드 기반 데이터 필터링
- `1모둠~5모둠` 입장 로직 + 각 모둠 최대 5명 제한
- 반코드 형식 검증(정규식 `^\d{5}$`)

### 단계 3. 학생 게임 코어
- 동물 캐릭터 선택
- Phaser 맵 이동 + 동일 모둠 플레이어 위치 실시간 동기화
- 몬스터 스폰/조우 트리거
- 도트 스타일(픽셀아트) 에셋 규격 적용(권장 32x32 또는 48x48)
- 캐릭터/몬스터 기본 애니메이션 4~6프레임으로 시작

### 단계 4. 전투/문제 엔진
- 레벨별 출제 정책 적용
  - L1→2차시, L2→3차시, L3→4차시, L4→5차시, L5→6차시, L6→7차시
- 문제 유형 2종 병행 출제
  - 객관식(선택지 기반)
  - 주관식(숫자/식 직접 입력)
- 문제 정답 판정, 전투 결과 처리
- 정답 시 몬스터 처치 + 아이템 드롭
- 오답 시 캐릭터 데미지 적용(HP 감소)
- 오답 누적 3회(wrongStreak >= 3) 시 레벨 다운그레이드
  - 단, 레벨 1은 다운그레이드 제외
  - 다운그레이드 발생 시 wrongStreak 초기화

### 단계 5. 성장/종료
- 레벨별 정답 15개 누적 시 레벨업
- 아이템 획득 시 외형 단계 업그레이드
- 레벨6에서 정답 15개 달성 시 만렙 처리 + 게임 종료

### 단계 6. 랭킹/리포트
- 우측 상단 실시간 레벨별 랭킹
- 종료 시 레벨별 활동 내역, 시간, 획득 아이템/장신구 리포트 출력

### 단계 7. 관리자 관제 페이지
- 모둠별 현재 인원/레벨 분포/정답률 대시보드
- 학생별 실시간 이벤트 타임라인
- 정오답/전투/레벨업 스트림 모니터링
- 레벨-성취수준 패널 추가
  - 학생별 `현재 레벨`, `성취수준`, `레벨 성취율(%)`, `최근 정답률` 표시
  - 모둠별 성취수준 분포(도전/기초/발전/숙련/심화/확장) 집계 차트 제공

### 단계 8. 문제 데이터 하드코딩
- 총 600문항 작성 (레벨당 100문항)
- 지도서/수학/수학익힘 범위 내 문항만 작성
- 각 문항에 `lessonTag`, `sourceTag` 포함

### 단계 9. 테스트/검증
- 25명 동시접속 시나리오
- 모둠 정원 제한 검증
- 레벨업/만렙/보상/랭킹 정합성 검증
- 관리자 실시간 반영 지연/누락 확인
- 오답 데미지 및 3오답 레벨 다운(레벨1 예외) 규칙 검증
- 객관식/주관식 정답 판정 허용오차(공백, 단위 제외 여부) 검증
- 성능 검증
  - 권장 환경 60fps 근접, 최소 환경 평균 30fps 이상 유지
  - 동시접속 시 타 사용자 이동 보간(interpolation)으로 점프 현상 최소화
  - 오브젝트 풀링 적용 후 전투/이펙트 구간 프레임 드롭 완화 확인
- 성취수준 검증
  - 레벨과 차시 매핑에 따른 성취수준 라벨이 올바르게 표시되는지 확인
  - `레벨 성취율 = min(100, 레벨 정답 수 / 15 * 100)` 계산 일치 여부 확인

## 8) 애니메이션 구현 원칙
- 렌더링과 네트워크 갱신 주기를 분리한다.
  - 렌더링: 60fps 기준
  - 위치 동기화: 10~20Hz
- 텍스처 아틀라스와 오브젝트 풀링을 기본 적용한다.
- 화면 밖 오브젝트 업데이트를 최소화한다(culling).
- 전투/문제 모달 전환은 200~300ms 내로 설계한다.
- 정답/오답 피드백 이펙트는 700ms 이내 종료한다.

## 6) 산출물
- 학생용 게임 웹앱
- 관리자용 실시간 관제 웹앱
- 레벨별 100문항 하드코딩 데이터셋
- 만렙 결과 리포트 화면

## 9) 일정(권장)
- 1주차: 단계 1~3
- 2주차: 단계 4~6
- 3주차: 단계 7~9
