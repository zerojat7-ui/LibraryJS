# Lotto645
2026-02-12
로또 6/45 당첨 번호 분석 및 추천번호 생성기 제작

## ver 9.1.0
2026-02-16

### 반자동 AI 상태 메시지 + 중복 저장 방지 (semiauto.js)

**AI 상태 메시지**
- 자동완성 실행 중 모래시계 옆에 AI 상태 실시간 표시
- 진행률 50% 미만: `🤔 Ai가 생각 중 입니다` (주황색)
- 진행률 50% 이상: `🎯 Ai가 번호를 선별 합니다` (보라색)
- CubeEngine `onProgress` 콜백 연동

**중복 저장 방지**
- 티켓에 `savedUuid` 필드 추가
- 저장 완료된 티켓은 저장 목록에서 자동 제외
- 저장된 티켓은 `✅ 저장됨 (번호 갱신 후 재저장 가능)` 표시
- 번호 변경·자동완성 갱신 시 `savedUuid` 초기화 → 재저장 가능
- `regenerateAuto`, `toggleSemiNum`, 수동 확정 모두 savedUuid 초기화 처리
- 저장 버튼: 미저장 완성 티켓이 없으면 비활성화


2026-02-16

### 포인트 시스템 버그 수정 (records.js, recommend.js, semiauto.js, app.js)

**버그1: 첫 구동 시 포인트 즉시 미지급**
- 원인: `initPointsIfNeeded()`가 async인데 `onDataLoaded()`에서 fire-and-forget으로 호출 → Firebase 응답 전에 배지 업데이트
- 수정: `.then(updatePointBadge)` 체인으로 완료 후 배지 갱신 보장
- 수정: 신규 유저 2000p 지급을 `_ptSaveFB` 직접 호출 → `_ptTransact` 트랜잭션으로 통일 (캐시 업데이트 타이밍 일치)

**버그2: 포인트 0인데 모든 동작 가능**
- 원인1: `saveForecastLocal` 내부 `usePoints` 호출이 fire-and-forget(반환값 미확인) → 포인트 부족해도 저장됨
- 원인2: `semiauto` 기록 저장, `recommend` 기록 저장에 포인트 차감 로직 없음
- 수정: `saveForecastLocal` 내부 `usePoints` 완전 제거
- 수정: `saveSemiTickets`, `saveSelectedRecs` 저장 직전 `await usePoints(N, '기록 저장 N개')` 추가 → 부족 시 저장 차단


2026-02-16

### 포인트 시스템 도입 (records.js, recommend.js, semiauto.js, main.html, style.css)

**Firebase 저장 구조**
- `user_points/{uid}` 문서로 관리
- `balance`: 잔여 포인트
- `firstGranted`: 첫 구동 2,000p 지급 여부 (재지급 방지)
- `lastWeeklyAt`: 마지막 주간 보너스 지급 시각 (재지급 방지)
- `awardedUuids`: 당첨 포인트 지급된 기록 uuid 목록 (재지급 방지)
- Firestore 트랜잭션(`runTransaction`)으로 동시접속 Race Condition 완전 차단
- LocalStorage는 오프라인 캐시 역할 (읽기 폴백)

**포인트 적립**
- 첫 구동 시 2,000p 자동 지급 (`firstGranted` 필드로 중복 방지)
- 매주 일요일 1,000p 자동 지급 (`lastWeeklyAt` 필드로 중복 방지)
- 기록 탭 당첨 시: 5등 5,000p / 4등 10,000p / 3등 20,000p / 2등 100,000p / 1등 1,000,000p (`awardedUuids`로 중복 방지)

**포인트 소비**
- 기본추천 갱신 1회: 5p
- 고급추천 1회: 50p
- 반자동 자동번호 1개당: 2p
- 기록 저장 1개당: 1p

**UI**
- 헤더 우측 상단 잔여 포인트 배지 표시 (`💎 N,NNNp`)
- 배지 클릭 시 포인트 규칙 팝업
- 포인트 변동 시 우측 상단 토스트 알림

### 반자동 전체 수동 저장 타입 수정 (semiauto.js, records.js)
- 수동 6개 선택 → 저장 시 type이 `'semi'(반자동)` 대신 `'manual'(수동)`으로 기록
- 기록 탭 배지: `✏️ 반자동` vs `👆 수동` 구분 표시


## ver 5.0 
역대 당첨번호 로 데이터 분석 후 추천 번호 생성
반자동 모드 생성

## ver 6.0
반자동 탭에서 당첨결과와 대조 기능 추가
당첨번호 데이터 최종회 까지 확충
고급 추천 엔진 기능 강화
(일반적으로 쓰는 랜덤 방식이 아니라 실제 추첨과 유사한 방식의 랜덤 번호 생성)

## ver 6.1
고급 추천번호 생성시 느림 개선

## ver 6.2
https://zerojat7-ui.github.io/LibraryJS/
외부 링크를 통해 엔진 최적화
엔진 가동상태 화면 표시

## ver 6.3
외부엔진 가동시간이 모바일환경에서 딜레이가 많음 모바일 환경 최적화 구현

## ver 6.3.1
고급 추천번호 작동시 모니터링 화면 사라짐 현상 복구

## ver 6.3.4
고급 추천 110에서 더 감소 구동안됨

## ver 7.0.0
UI 전면 교체 데이터 업로드와 메인 페이지 분리

## ver 7.1.0
data loading error 수정

## ver 7.2.0
data save 기능 수정

## ver 8.0.0
2026-02-15

### 아키텍처 개편
- `index.html` → `main.html` 직접 진입 (LoadData 경유 제거)
- `LoadData.html` 독립 관리 페이지로 분리 (직접 접근 전용)

### 엔진 학습 통합
- 추천(recommend.js)과 반자동(semiauto.js)의 CubeEngine 학습 상태를 분리 운영하던 것을
  Firestore `shared_engine_state` 단일 문서로 통합
- 양쪽 탭 실행 결과가 누적 학습(iteration)에 공동 기여 → 장기적으로 추천 정밀도 향상
- 저장 시 `source` 필드로 출처 구분 ('recommend' / 'semi')

### 저장 데이터에 엔진 버전 추가
- LocalStorage 및 Firebase `recommendations` 컬렉션 저장 시 `engineVersion` 필드 포함
- 기록 탭 카드에 엔진 버전 표시 (예: v2.0.1)

### 탭 구성 변경
- 기존 4탭 → 5탭으로 확장
- 순서: [🏆 당첨] [📊 분석] [🎯 추천] [✏️ 반자동] [📋 기록]

### 당첨 탭 신설
- 전체 당첨 이력을 내림차순(최신순)으로 표시
- 각 회차 카드: 번호볼 + 보너스볼 + 통계(홀짝/고저/끝수합/번호합/AC값)
- 이미지 시안 기반 UI 구현

### 헤더 정리
- main.html 상단 좌측 뒤로가기(←) 버튼 제거

## ver 8.1.0
2026-02-15

### LoadData.html 전면 재작성
- Firebase SDK를 최상단에 로드하여 초기화 순서 보장
- 외부 js 파일(app.js 등) 의존성 완전 제거 → 단독 실행 가능
- **보너스번호 입력란 추가** (주황 점선 버튼, 입력 시 중복 검증)
- 번호 선택 시 실시간 미리보기 (로또볼 렌더링)
- CSV 업로드 시 기존 데이터와 병합 처리 (중복 회차 덮어쓰기)
- Firebase 현황 패널: 저장 회차 수 · 범위 · 마지막 업데이트 시간 표시
- 저장 흐름: 입력 → Firebase 저장 → LocalStorage 캐시 자동 동기화

### index.html 전면 재작성
- Firebase 우선 로드 → LocalStorage 캐시 → history.json 순서로 폴백
- Firebase와 LS 캐시 동시 존재 시 회차 번호 비교하여 최신 데이터 선택
- 4단계 진행 도트 UI (연결 → 데이터 로드 → 캐싱 → 이동)
- 어떤 경우에도 main.html로 진입 보장 (데이터 없어도 이동)

## ver 8.8.1
2026-02-15

### 반자동 추가 버튼 동작 불가 핫픽스 (semiauto.js)

- ver 8.8.0 수정 시 버튼 HTML 문자열 중간에 줄바꿈이 삽입되어 JS 문법 오류 발생
- `Unterminated string literal` 오류로 semiauto.js 전체 로드 실패 → 추가 버튼 포함 모든 기능 동작 안 함
- 문자열 한 줄로 정리 후 node --check 문법 검증 완료

## ver 8.8.0
2026-02-15

### 버그 수정 및 UI 개선 (main.html, recommend.js, semiauto.js)

**버튼 텍스트 변경**
- `🚀 고급 분석 (큐브 ML 엔진)` → `🚀 고급 추천 (AI 엔진)`
- 분석 중: `⏳ AI 분석 중...` / 완료 후: `🔁 다시 추천`

**노란색 코멘트 표시 타이밍 수정**
- 기본 `display:none` → 버튼 클릭 시 `display:block`
- 분석 완료/오류 시 자동으로 `display:none` 복귀

**현재 탐색 조합 대기 중 해결**
- CubeEngine 라이브러리가 `stats.currentCombo` 파라미터를 전달하지 않는 문제 우회
- `evolving` 단계에서 라운드 번호 기반 시각적 탐색 조합 생성 → 매 라운드마다 업데이트
- 실제 엔진 데이터 지원 시 우선 사용, 없으면 가상 조합으로 대체

**반자동 전체 수동(6개) 저장 불가 버그 수정 (semiauto.js)**
- `allFull` 시 `disabled` 처리로 확정 버튼 클릭 불가 → `t.done = true` 미실행 → 저장 안 됨
- `disabled` 제거, 버튼 색상 `#27ae60`(초록)으로 시각 구분
- 버튼 텍스트: `✅ 확정`, 안내문: `6개 선택 완료! 확정하세요 👆`

## ver 8.7.0
2026-02-15

### 모니터 UI 버그 수정 (recommend.js, main.html)

**로그 HTML 태그 노출 수정**
- `mLog()` 내부를 `textContent` → `innerHTML`로 변경
- `<strong style="color:#69f0ae;">3</strong>` 같은 태그가 글자 그대로 보이던 문제 해결
- 누적 학습 iteration 숫자가 색상 강조와 함께 정상 렌더링

**현재 탐색 조합 무한 대기 수정**
- `onProgress` 의 `evolving` 단계에서 `stats.currentCombo` / `stats.bestCombo` 로 `mShowCombo()` 호출 추가
- `onRound` 콜백에도 `bestCombo` 파라미터 추가 → 매 라운드마다 최고 조합 표시

**분석 버튼 하단 안내 코멘트 추가**
- 버튼 바로 아래 노란색(`#f5a623`) 소자 텍스트로 표시
- `⏳ AI가 신중히 선택하므로 다소 시간이 걸립니다`

## ver 8.6.0
2026-02-15

### 엔진 누적 학습 구조 근본 수정 (recommend.js, semiauto.js)

**문제 원인**
- 기존 `.set()` 방식은 마지막 저장자가 이전 결과를 완전히 덮어쓰는 구조였음
- probMap이 매 실행마다 새 값으로 교체 → 이전 학습 결과가 사라짐
- iteration 숫자만 증가할 뿐 실질적 누적 없음

**해결: Firestore 트랜잭션 + 가중 평균 누적 병합**
- `db.runTransaction()` 적용 → 동시 접속 시 Race Condition 완전 차단
- probMap 저장 시 가중 평균 병합 적용:
  ```
  merged[n] = (기존값 × min(iteration, 50) + 신규값 × 1) / (min(iteration,50) + 1)
  ```
- iteration이 쌓일수록 기존 학습 비중이 커져 안정적으로 수렴
- 50회 이후에는 새 실행이 기존 학습의 약 2%만 반영 (과학습 방지)

**다른 사용자와 학습 공유**
- 사용자A·B·C 모두 `shared_engine_state` 하나를 공유
- 각 실행마다 트랜잭션으로 안전하게 누적 → 실제로 함께 학습

**UI 개선**
- 모니터 카드 `학습 이터레이션` → `누적 총 학습 N회`로 변경
- 수렴률을 log 스케일로 계산 (50회에 ~95% 수렴)
- 로드 시 누적 횟수·최고점 함께 표시

## ver 8.5.0
2026-02-15

### UI/UX 개선 (main.html, app.js)

**제목 변경**
- `🎰 로또 6/45` → `🎰 로또의 모든것`
- 폰트 크기 20px → 16px 축소
- `<title>` 태그도 동일하게 변경

**헤더 최신회차 옆 추첨일 표시**
- `updateMainHeader()`: `1211회차 (2026.02.14)` 형식으로 표시
- date 필드가 없으면 회차만 표시 (하위 호환)

**당첨 카드 개선**
- 회차 옆 추첨일 표시 (연회색 소자 텍스트)
- 카드 우측 상단에 당첨인원수 👥 N명 표시 (CSV winners 필드)
- 보너스볼 크기 38px → 32px 축소로 짤림 현상 해결
- 보너스볼 외곽선 두께도 2.5px → 2px로 조정

**CSV winners 필드 파싱 추가 (app.js, LoadData.html)**
- 신형식 CSV의 10번째 컬럼(당첨게임수 `"14 명"`)에서 숫자 추출
- lottoData 객체에 `winners: "14명"` 형태로 저장

## ver 8.4.0
2026-02-15

### CSV 신형식 대응 (app.js, LoadData.html)

**새 CSV 형식 자동 인식**
- 기존: `회차,번호1,번호2,번호3,번호4,번호5,번호6,보너스`
- 신규: `회차,추첨일,번호1,번호2,번호3,번호4,번호5,번호6,보너스,당첨게임수,당첨금액`
- 헤더 2번째 컬럼이 `추첨일|날짜|date`이면 신형식으로 자동 전환, 아니면 구형식 처리

**따옴표 포함 필드 파싱 지원**
- 당첨금액 컬럼(`"2,370,956,036 원"`) 처럼 따옴표 내 쉼표를 임시 치환 후 파싱하여 컬럼 오파싱 방지

**추첨일 저장**
- 신형식 CSV 업로드 시 `date` 필드(`YYYY-MM-DD`)를 lottoData 객체에 함께 저장

**downloadWinCSV 업데이트**
- 다운로드 형식도 신형식(`회차,추첨일,번호1~6,보너스`)으로 변경

**LoadData.html 안내문 갱신**
- CSV 형식 설명을 신/구형식 모두 표시하도록 업데이트

## ver 8.3.0
2026-02-15

### 당첨 탭 카드 스크롤 개선 (app.js)

**3개 카드 고정 노출 + 스크롤**
- 당첨 탭에서 최초 3개 회차 카드만 화면에 표시
- 나머지 회차는 스크롤하여 확인 가능 (`overflow-y: scroll`)
- `height: 62vh` / `min-height: 480px` 고정 스크롤 박스 적용
- `overscroll-behavior: contain` + `-webkit-overflow-scrolling: touch` 모바일 최적화
- 하단 **⬆️ 맨 위로** 버튼으로 최신 회차로 즉시 복귀

## ver 8.2.0
2026-02-15

### 당첨 탭 UI 개선 (app.js)

**번호볼 한 줄 표시**
- `flex-wrap:nowrap` + `overflow-x:auto` 적용으로 번호볼 + 보너스볼이 항상 한 줄에 표시
- 볼 크기 42px → 38px로 조정하여 모바일 화면에서 잘리지 않게 처리

**색상 통계 추가**
- 황(1~10) · 청(11~20) · 적(21~30) · 흑(31~40) · 녹(41~45) 구간별 번호 개수 집계
- `황+청+적+흑+녹` 형식으로 표시 (예: `3+1+1+1+0`)

**연속번호 출현 표시 추가**
- 인접 번호 간 차이가 1인 쌍(pair) 개수를 계산
- 연속 쌍이 1개 이상이면 빨간색으로 강조, 없으면 회색 표시

**통계 레이아웃 2행 분리**
- 1행: 홀짝 · 고저 · 색상 · 연속
- 2행: 끝수합 · 번호합 · AC값

## ver 9.2.0
2026-02-16

### 현재 탐색 조합 숫자 깨짐 버그 수정 (recommend.js)

**원인**
- `cube-engine.js v2.1.0` 업데이트로 `onRound` 콜백의 3번째 인자가 변경됨
  - 구버전: `onRound(roundNum, bestScore, bestCombo)` — 조합 번호 배열
  - v2.1.0: `onRound(roundNum, bestScore, scoreHistory)` — 라운드별 점수 배열
- `recommend.js`의 `onRound`가 `scoreHistory`(점수값 배열)를 `mShowCombo()`에 그대로 전달
  → `[371.6, 503.1, 450.2 ...]` 같은 소수점 숫자가 로또볼로 렌더링되어 깨진 화면 표시

**수정**
- `onRound` 3번째 인자명 `bestCombo` → `scoreHistory`로 변경, `mShowCombo()` 호출 완전 제거
- `onProgress evolving`의 탐색 조합 표시 로직 교체:
  - 기존: `stats.currentCombo` / `stats.bestCombo` (엔진 미지원 필드) 우선 시도
  - 변경: `stats.topItems` (v2.1.0에서 추가된 이번 라운드 상위 번호 배열) 우선 사용
  - 폴백: 라운드 시드 기반 가상 조합 (기존 유지)

## ver 9.4.0
2026-02-16

### 번호 쏠림 버그 수정 + STATCACHE 패널 복구 (cube-engine.js, index.html)

**cube-engine.js v2.2.1**

버그 수정: 라운드별 probMap 동적 갱신 완전 제거
- 원인: 매 라운드마다 상위 조합 번호에 `× 1.05` 적용 후 `× 6.75` 정규화 반복
  → 50라운드 누적 시 특정 번호 확률 0.95 클램프, 나머지 번호 0.005 이하로 수렴
  → 3번·6번·12번 등 초기 우세 번호가 고착되는 피드백 루프
- 수정: 동적 갱신 블록 제거. probMap은 ML + StatCache + 보너스 학습으로만 구성

기능 추가 (v2.2.0 포함):
- `buildStatCache()` — colorZone(구역별 빈도/간격) 추가
- `buildWeightedProb()` — bonusHistory 보너스 빈도 학습 추가
- `scoreCombo()` — colorZoneWeight 색상 구역 균형 점수 추가
- 신규 옵션: `bonusHistory`, `bonusWeight(0.15)`, `colorZoneWeight(0.20)`

**index.html (학습 모니터)**

버그 수정: STATCACHE 패널 데이터 미표시
- 원인: `CubeEngine._buildStatCache` 참조 → 엔진은 `buildStatCache`로 노출 (언더스코어 없음)
- 수정: `CubeEngine.buildStatCache(nums, {items:45, recentWindow:30, history:nums})` 로 수정
- 결과: 빈도/최근30회/간격/재출현 4개 탭 정상 표시
