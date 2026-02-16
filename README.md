# CubeEngine - 버전 히스토리

> Hybrid Cube Evolution × ML Probability Engine  
> 범용 확률 기반 조합 추천 라이브러리

---

## 📋 목차

- [최신 버전 (v2.5.0)](#최신-버전-v250)
- [주요 마일스톤](#주요-마일스톤)
- [상세 버전 히스토리](#상세-버전-히스토리)
  - [v2.5.x - 5종 지표 트렌드 학습](#v25x---5종-지표-트렌드-학습)
  - [v2.4.x - 6종 트렌드 전면 반영](#v24x---6종-트렌드-전면-반영)
  - [v2.3.x - 색상 구역 트렌드](#v23x---색상-구역-트렌드)
  - [v2.2.x - 번호 쏠림 해결](#v22x---번호-쏠림-해결)
  - [v2.1.x - 통계 캐시 + 성능 최적화](#v21x---통계-캐시--성능-최적화)
  - [v2.0.x - 구조 개편](#v20x---구조-개편)
  - [v1.x - 초기 버전](#v1x---초기-버전)

---

## 최신 버전 (v2.5.0)

**릴리즈**: 2026-02-16

### 주요 기능

✨ **5종 지표 트렌드 학습 (stat50Trend)**
- freq / recentFreq / gap / reHit / bonus 지표의 최신50회 vs 이전50회 비교
- 델타 기반 트렌드 분석 (강세/약세/보합 판정)
- 가중 합산 후 0~1 정규화, probMap에 10% 반영
- history 50회 미만 시 자동 중립화

🔄 **백테스팅 50회 체크포인트**
- 900회 초기학습 후 50회 단위 검증
- 체크포인트 상태 유지 (nextIdx / probMap / cumulativeHistory)
- UI 컨트롤: [▶ 계속] [↺ 재시작] [☑ 자동계속] [☑ 자동반복]
- Firebase 누적 학습 구조

---

## 주요 마일스톤

| 버전 | 날짜 | 핵심 변화 |
|------|------|----------|
| **v2.5.0** | 2026-02-16 | 5종 지표 트렌드 학습 + 백테스팅 체크포인트 |
| **v2.4.0** | 2026-02-16 | 6종 트렌드 전면 반영 (홀짝/AC/연속/끝수/합/고저) |
| **v2.3.0** | 2026-02-16 | 색상 구역 트렌드 (zoneTrend) 반영 |
| **v2.2.4** | 2026-02-16 | 🔥 Firebase 블렌딩 구조 근본 수정 (누적 고착 해결) |
| **v2.2.1** | 2026-02-16 | 번호 쏠림 버그 수정 (probMap 동적 갱신 제거) |
| **v2.1.0** | 2026-02-16 | StatCache + WeightedProb + historySet O(1) 최적화 |
| **v2.0.0** | - | 구조 개편 (Firebase 연동, excludeNumbers, 적응형 학습) |
| **v1.0.0** | - | 최초 릴리즈 (범용화, 프리셋, 콜백) |

---

## 상세 버전 히스토리

### v2.5.x - 5종 지표 트렌드 학습

#### **v2.5.0** (2026-02-16)

**엔진 (cube-engine.js)**

5종 지표 트렌드 분석 추가
- **분석 대상**: freq / recentFreq / gap / reHit / bonus (색상 제외)
- **비교 방식**: 최신 50회 vs 이전 50회 각 지표별 델타 계산
  - freq delta: `최신50 출현수 - 이전50 출현수`
  - gap delta: `이전50 간격 - 최신50 간격` (gap 감소=최근 강세=양수)
  - reHit delta: `최신50 재출현 - 이전50 재출현`
  - bonus delta: `최신50 보너스 빈도 - 이전50 보너스 빈도`
- **가중 합산**: `freq×0.30 + recent×0.30 + gap×0.20 + reHit×0.10 + bonus×0.10`
- **정규화**: delta → 0~1 범위 (0.5=중립, >0.5=강세, <0.5=약세)
- **적용**: buildWeightedProb 가중치 10% 반영
- **안전장치**: history 50회 미만이면 중립값(0.5)으로 무효화

**백테스팅 (index.html)**

50회 체크포인트 구조
- **초기 학습**: 900회 학습 후 901회부터 50회 단위 검증
- **상태 유지**: `BT_STATE` (nextIdx / currentProbMap / cumulativeHistory)
- **UI 컨트롤**:
  - `[▶ 계속 (다음 50회)]`: 현재 probMap + cumulativeHistory 이어서 실행
  - `[↺ 처음부터 재시작]`: BT_STATE 초기화 후 재시작
  - `☑ 50회마다 자동 계속`: 체크 시 50회 완료 후 0.5초 대기 후 자동 계속
  - `☑ 데이터 소진 시 자동 반복`: 전체 소진 후 이전 probMap 반영하여 자동 재시작
- **학습 누적**: 각 청크 완료마다 backtest_engine_state 저장, 다음 청크는 이전 probMap 반영

---

### v2.4.x - 6종 트렌드 전면 반영

#### **v2.4.2** (2026-02-16)

**5종 트렌드 윈도우 고정**
- 기존: 전체 trendHistory를 동적으로 반으로 나눔 → 데이터 수에 따라 윈도우 변동
- 변경: `tHalf = min(50, floor(length/2))` 고정 → 최근50 / 이전50
- 색상 트렌드는 최근20/이전20 절대값 방식 유지

**백테스팅 50회 중단/재가동/반복**

| 상황 | 동작 |
|---|---|
| 최초 실행 | 900회 초기학습 → 901회부터 50회 검증 후 중단 |
| 재가동 | 중단 회차부터 이어서 50회, 이전 학습 50:50 블렌딩 반영 |
| 반복(체크박스) | 900회부터 재시작, 이전 학습 50:50 블렌딩 반영 |
| 데이터 끝 도달 | 자동으로 반복 재시작 (900회부터) |

- `BT_RESUME_INDEX`: 중단 위치 저장 (-1=처음부터)
- `BT_STEP = 50`: 1회 실행당 검증 회차 수

#### **v2.4.1** (2026-02-16)

**색상 트렌드 구조 개선**

문제점
- 최근100회 전반50/후반50 비율(ratio) 방식
- 전반 평균이 0에 가까울 때 ratio 폭발적 증가 → 편향 유발
- 100회 윈도우가 너무 넓어 장기 패턴에 끌려다님

변경사항
- **최근20회 / 이전20회 절대변화값(delta)** 방식
  ```
  recentAvg = 최근 20회 구역별 회차당 평균 출현수
  prevAvg   = 이전 20회 구역별 회차당 평균 출현수
  zoneDelta = recentAvg - prevAvg
    > 0  : 강세 (최근에 더 많이 출현)
    < 0  : 약세 (최근에 덜 출현)
    = 0  : 보합
  ```
- **정규화**: `delta ±1.2` 기준 → `0~1` clamp (0.5=보합)
- **scoreCombo 보너스 기준 변경**:
  - 기존: ratio >= 1.2 → 보너스
  - 변경: delta > 0.2 → `+delta × 2.5`, delta < -0.2 → `+delta × 1.5`
- **추가 반환값**: `stat.zoneAvg`, `stat.zoneDelta`
- **안전장치**: history 10회 미만 시 계산 스킵, zoneTrend 0.5(중립) 유지

#### **v2.4.0** (2026-02-16)

**6종 트렌드 전면 반영**

공통 구조
- 최근 100회 → 전반50 / 후반50 분리
- `ratio = 후반평균 / 전반평균`
- `> 1.0` 강세 / `< 1.0` 약세
- 범위 클램프: `0.5 ~ 2.0`

buildStatCache — trends 객체 추가

| # | 트렌드 | 계산 방식 |
|---|---|---|
| ① | 홀짝 `oddRatio` | 회차당 홀수 개수 전반/후반 비교 |
| ② | AC값 `acAvg / acTrend` | 회차당 AC값 평균 전반/후반 비교 |
| ③ | 연속성 `consecAvg / consecTrend` | 회차당 연속쌍 수 전반/후반 비교 |
| ④| 끝수 `tailTrend[0~9]` | 끝자리별 출현수 전반/후반 비교 |
| ⑤ | 번호합 `sumAvg / sumTrend` | 회차당 번호합 평균 전반/후반 비교 |
| ⑥ | 고저 `highRatio` | 회차당 고번호(23~45) 개수 전반/후반 비교 |

buildWeightedProb — 가중치 재설계 (합계 1.00)
```
freqScore      0.18  (←0.22)
recentScore    0.18  (←0.22)
gapScore       0.10  (←0.13)
reHitScore     0.10  (←0.13)
bonusScore     0.15
zoneGapScore   0.04  (←0.05)
colorTrend     0.08  (←0.10)
oddTrend       0.07  신규 ← ① 홀짝
tailTrend      0.07  신규 ← ④ 끝수
highTrend      0.03  신규 ← ⑥ 고저
```

scoreCombo — AC/연속성/번호합 트렌드 보너스 추가
- ② AC값: 조합 AC가 acAvg ±1 이내 → 보너스, ±2 초과 → 감점
- ③ 연속성: 조합 연속쌍 수가 consecAvg ±0.5 이내 → 보너스
- ⑤ 번호합: 조합 합계가 sumAvg ±10 이내 → 보너스, ±20 초과 → 감점
- 모두 `colorZoneWeight` 비율 적용

트렌드 무시 안전장치
- history 없음 → trends 전항목 기본값(1.0) → 영향 없음
- history 10회 미만 → 계산 스킵
- stat/trends 없음 → scoreCombo 트렌드 블록 스킵

---

### v2.3.x - 색상 구역 트렌드

#### **v2.3.0** (2026-02-16)

**색상 구역 변화 트렌드 반영**

문제점
- 기존 색상 구역 처리(`zoneGap`, `zoneFreq`)는 단순 출현 여부/간격만 측정
- 최근 흐름(강세/약세 트렌드)이 probMap에 반영되지 않음

buildStatCache — zoneTrend 계산 추가
- 최근 100회를 전반 50회 / 후반 50회로 분리
- 각 구역별 회차당 평균 출현수 계산 (출현여부 0/1 아닌 실제 개수)
- `trendRatio = 후반평균 / 전반평균`
  - `> 1.0` : 강세 (최근에 더 많이 출현)
  - `< 1.0` : 약세 (최근에 덜 출현)
  - 범위 클램프: `0.5 ~ 2.0`
- 전반 평균 0인 구역(한번도 미출현): 후반 출현 시 1.5 처리

buildWeightedProb — trend 가중치 10% 신규 반영
- `trendScore[n]` = 해당 번호 구역의 trendRatio → 0~1 정규화
- 강세 구역 번호 확률 상승 / 약세 구역 번호 확률 하락
- 기존 가중치 조정 (합계 1.00 유지):
  ```
  freqScore   0.25 → 0.22
  recentScore 0.25 → 0.22
  gapScore    0.15 → 0.13
  reHitScore  0.15 → 0.13
  bonusScore  0.15 유지
  zgScore     0.05 유지
  trendScore  0.10 신규
  ```

scoreCombo — 트렌드 강세/약세 보너스 반영
- 강세 구역(`trendRatio >= 1.2`) 번호 포함 시 `+(ratio-1.0)×3` 점 보너스
- 약세 구역(`trendRatio <= 0.8`) 번호 포함 시 `-(1.0-ratio)×2` 점 감점
- `colorZoneWeight` 비율 적용 (기본 0.20)
- `scoreCombo(combo, probMap, cfg, stat)` — stat 파라미터 추가

검증 결과
- 황구역 약세(ratio=0.504), 청구역 강세(ratio=2.000) 시나리오
- 청구역 평균 확률 / 황구역 평균 확률 = 1.207 (청 > 황) 정상 확인

---

### v2.2.x - 번호 쏠림 해결

#### **v2.2.7** (2026-02-16)

**백테스팅 경로 분리 + setCubeEngine.html 신설**

백테스팅 경로 분리 (index.html)
- 기존: 백테스팅 결과가 `shared_engine_state`에 저장 → 로또 웹 학습 오염
- 변경: 백테스팅 → `backtest_engine_state` 전용 문서에 저장
- 새 함수: `saveBacktestState(probMap)` — backtest_engine_state에 가중 평균 병합
- 새 버튼: `✅ 로또 웹에 적용` — 백테스팅 완료 후에만 표시
  - `applyBacktestToLive()`: backtest + shared 50:50 병합 → shared_engine_state 저장
  - confirm 대화상자로 의도치 않은 적용 방지
- 반복 백테스팅 시 로또 웹 학습 영향 없음

setCubeEngine.html 신설
- 대시보드 헤더 `⚙️ 엔진 설정` 버튼 → setCubeEngine.html 이동
- 4탭 구성:
  1. 🎛 프리셋: lotto645/lotto638/파워볼/메가밀리언/유로밀리언/케노/터보/커스텀
  2. 🧠 학습 파라미터: items/pick/rounds/poolSize/topN/evolveTime + 가중치 5종 슬라이더
  3. 🔥 Firebase: collection/document 경로 직접 입력, 학습 공유 토글
  4. 📋 코드 생성: 현재 설정 → 복사 가능한 JS 코드 자동 생성
- 하단 공통: 테스트 실행 (Firebase 없이 로컬), 설정 저장/불러오기 (LocalStorage), 초기화

#### **v2.2.5** (2026-02-16)

**색상 구역 통계 최근 100회로 제한**
- buildStatCache() 색상 구역 계산 범위 제한
  - 전체 이력 사용 → 최근 100회만 사용
  - 오래된 패턴(수년 전) 영향력 배제, 최근 트렌드 반영
- zoneFreq, zoneGap 계산에 적용
- 효과: 더욱 균등한 확률 분포, 시대별 트렌드 변화 적응

#### **v2.2.4** (2026-02-16)

**🔥 Firebase 블렌딩 구조 근본 수정 (누적 고착 해결)**

문제 발견
- Firebase 블렌딩이 ML 학습 **후**에 적용되어 새 학습 무시됨
- 이전 확률 70% + 새 학습 30% = 과거 학습이 계속 누적 고착
- 3, 6, 12, 16, 38, 40이 한번 높아지면 영구 고정되는 악순환

구조 수정
- Firebase 블렌딩을 ML 학습 **전**으로 이동
- 원래 의도대로 sin/cos 초기값 조정 목적으로만 사용
- 이전 학습 → ML 학습 → StatCache 블렌딩 → 정규화 순서로 변경

효과
- 매 실행마다 과거 데이터로 새롭게 학습
- 누적 편향 제거
- 확률 분포 균등화

#### **v2.2.3** (2026-02-16)

**4중 번호 쏠림 방지 강화**

① 확률 정규화 강화
- 최소값을 평균의 30% 이상으로 보장
- 극단적으로 낮은 확률(0.005 이하) 방지
- 하위 번호 기회 확대

② statWeight 기본값 조정
- 0.35 → 0.15 (ML 비중 증가)
- 과거 데이터 과적합 방지

③ 매 10라운드마다 확률 재분배
- 상위 50개 조합에서 5회 이상 등장한 번호 확률 10% 감소
- 한 번도 등장하지 않은 번호 확률 10% 증가
- 특정 번호 고착 방지, 다양한 번호 탐색 유도

④ 후보 생성 시 완전 랜덤 강제 포함
- 각 후보마다 0~1개 번호를 확률 무시하고 완전 랜덤 선택
- 상위 번호만 선택되는 패턴 차단
- 다양성 확보

#### **v2.2.2** (2026-02-16)

**번호 쏠림 방지 강화 + 기당첨 완전일치 제외**

① evolveHybridCube() — 랜덤 가중치(0.95~1.05) 적용
- 기존 고정값 대신 `randomBoost = 0.95 + Math.random() * 0.10` 생성
- 특정 번호 고착 방지
- 다양성 증가

② 최종 추천 조합 선정 시 historySet.has() 체크 추가
- 6개 번호가 기당첨 이력과 완전 일치하면 해당 조합 스킵
- 실전 활용 가능한 새로운 조합만 추천

#### **v2.2.1** (2026-02-16)

**번호 쏠림 버그 수정**

문제 원인
- 매 라운드 상위 조합에 ×1.05 적용
- 50라운드 누적 시 특정 번호 고착

수정 내용
- 라운드별 probMap 동적 갱신 블록 완전 제거
- probMap은 ML + StatCache + 보너스 학습으로만 구성

#### **v2.2.0** (2026-02-16)

**colorZone + bonusHistory 학습 기능 추가**

① buildStatCache() — 색상 구역별 빈도/간격 추가
- 황(1~10) / 청(11~20) / 적(21~30) / 흑(31~40) / 녹(41~45)

② buildWeightedProb() — bonusHistory 보너스 번호 학습
- bonusWeight 옵션 (기본 0.15)

③ scoreCombo() — colorZoneWeight 색상 균형 점수 추가
- 기본값 0.20

④ DEFAULTS 추가
- `bonusHistory: null`
- `bonusWeight: 0.15`
- `colorZoneWeight: 0.20`

---

### v2.1.x - 통계 캐시 + 성능 최적화

#### **v2.1.1** (2026-02-16)

**index.html 대시보드 개선**

① poolSize 슬라이더 추가
- 100~10,000 범위, 100 단위 조절 가능

② 로또 웹 당첨 히스토리 연동
- lotto_history/lotto645_history→draws 실제 로드 후 엔진에 전달

③ 실행 시 단계별 상태 표시
- "당첨 데이터 로딩 중" → "학습 상태 로딩 중" → "엔진 실행" 순으로 명확화

④ path-box에 당첨 히스토리 경로/상태 행 추가
- 초기 로드 시 회차수 사전 확인

⑤ renderStat — numbers 배열/2D 배열 양쪽 형태 모두 수용

#### **v2.1.0** (2026-02-16)

**cube-engine.js 주요 업그레이드**

① buildStatCache() 추가
- freq / recentFreq / gap / reHit 사전 계산

② buildWeightedProb() 추가
- 통계 기반 확률 레이어
- statWeight 옵션 (기본 0.35)

③ historySet O(1) 도입
- isTooSimilar O(N) → O(1) 대체
- 후보 생성 속도 향상

④ onProgress stats 확장
- scoreHistory, probMap, topItems, cubeResults 실시간 전달

⑤ onRound 시그니처 변경
- 3번째 인자 scoreHistory 추가

⑥ result 필드 추가
- scoreHistory, stat

⑦ index.html 학습 상태 모니터링 대시보드로 전면 개편

⑧ meta.version 필드 추가

⑨ DEFAULTS 추가
- `statWeight: 0.35`
- `recentWindow: 30`

---

### v2.0.x - 구조 개편

#### **v2.0.1**

진화 루프 최적화
- 적응 주기 1000 → 100으로 단축
- topCandidatePool 파라미터 추가

#### **v2.0.0**

구조 개편
- 범위 설정 (rangeStart/End)
- 제외숫자 (excludeNumbers)
- Firebase 연동
- 적응형 학습률
- 라운드별 probMap 동적 갱신

---

### v1.x - 초기 버전

#### **v1.2.1**
- 기본값 추가 조정

#### **v1.1.2**
- 기본값 추가 조정

#### **v1.1.1**
- 기본값 변경: evolveTime 150, loopMin 5000, poolSize 3000

#### **v1.1.0**
- reportProgress 타이밍 수정
- 라운드 완료 후 즉시 반영

#### **v1.0.0**
- 최초 릴리즈
- 범용화, 프리셋, 콜백
- CommonJS/브라우저 지원

---

## index.html 학습 모니터 히스토리

### **v2.2.2** (2026-02-16)

**UI 간소화 + Firebase 연결 체크 + Pool Size 슬라이더 개선**

① 상태 불러오기 버튼 제거

② 초기화 버튼 제거

③ Firebase 연결 사전 체크 추가
- 연결 실패 시 "Database에 연결이 안돼 테스트가 불가능 합니다" 알림

④ Pool Size 슬라이더 자동 비활성화
- 학습 시작 시 disabled, 완료/오류 시 재활성화
- disabled 스타일: opacity 50% + cursor:not-allowed

---
### **v2.2.3 UI** (2026-02-16)

**KPI 한줄 바 + 하단 레이아웃 개선**

① KPI 4개 항목 레이아웃 변경
- 기존: 2×2 카드 그리드 (`g4`)
- 변경: 한 줄 수평 바 (4열, 구분선 포함)
- 항목: 누적 Iteration / POOL 크기 / BEST SCORE / 변화 번호
- 번호를 크게(32px), 레이블·설명을 아래에 컴팩트하게 배치

② 하단 섹션 순서 변경
- 기존: StatCache → [추천 조합 | 실시간 로그] (좌우 분할)
- 변경: StatCache → 실시간 로그(전체 너비) → 추천 조합(전체 너비)
- 실시간 로그 높이 160px → 200px (넓어진 공간 활용)

---
## 라이센스

zerojat7 License

## 문의

GitHub Issues를 통해 버그 리포트 및 기능 제안을 남겨주세요.
