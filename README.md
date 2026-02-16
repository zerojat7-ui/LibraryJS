# CubeEngine v2.1.0

> Hybrid Cube Evolution × ML Probability Engine  
> 범용 확률 기반 조합 추천 라이브러리

---

## 핵심 개념

```
과거 데이터 학습 (선택)
    ↓
StatCache 사전 계산 (freq / recentFreq / gap / reHit)   ← v2.1.0 신규
    ↓
ML 확률 모델 구성 (sigmoid + 가중치)
    + 통계 기반 WeightedProb 블렌딩                      ← v2.1.0 신규
    ↓
각 항목을 독립적으로 큐브 진화
    ↓
후보 조합 생성 (historySet O(1) 중복 체크)              ← v2.1.0 신규
    ↓
상위 조합 반환
```

과거 데이터가 **없어도 동작**합니다.  
있으면 학습해서 더 정교한 확률을 씁니다.

---

## 빠른 시작

### 브라우저 (script 태그)
```html
<script src="cube-engine.js"></script>
<script>
    CubeEngine.generate({ items: 45, pick: 6 })
        .then(function(result) {
            console.log(result.results); // [[3,14,22,33,38,44], ...]
        });
</script>
```

### ES Module
```javascript
import CubeEngine from './cube-engine.js';
const result = await CubeEngine.generate({ items: 45, pick: 6 });
```

### Node.js
```javascript
const CubeEngine = require('./cube-engine.js');
const result = await CubeEngine.generate({ items: 45, pick: 6 });
```

---

## 설정값 (Options)

### 필수
| 옵션 | 타입 | 설명 |
|------|------|------|
| `items` | number | 전체 항목 수 (예: 로또=45) |
| `pick`  | number | 뽑을 개수 (예: 로또=6) |

### 선택 — 데이터
| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `history` | `null` | 과거 데이터 2D 배열. `null`이면 순수 진화만 사용 |
| `threshold` | `5` | 과거와 이 개수 이상 겹치면 중복 제거 (history 필요) |

### 선택 — 루프 제어 ⚙️
| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `evolveTime` | `80` | 각 번호 진화 시간 (ms). **클수록 정밀, 오래 걸림** |
| `loopMin` | `1000` | 최소 반복 횟수. evolveTime 미달 시 이 횟수까지 계속 |
| `rounds` | `50` | 전체 진화 라운드. **클수록 다양한 조합 탐색** |
| `poolSize` | `2500` | 라운드당 조합 생성 수. **클수록 좋은 조합 발견 가능성↑** |

> **속도 조절 팁**
> - 빠르게 테스트: `evolveTime:40, rounds:15, poolSize:800` (`turbo` 프리셋)
> - 정밀 분석: `evolveTime:150, rounds:100, poolSize:5000`

### 선택 — 결과
| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `topN` | `5` | 최종 반환 조합 수 |
| `lambda` | `0.18` | 최근 데이터 가중치 감쇠율 (클수록 최근 중시) |
| `learningRate` | `0.05` | ML 업데이트 강도 |

### 선택 — v2.1.0 신규
| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `statWeight` | `0.35` | 통계 확률과 ML 확률 블렌딩 비율 (0=ML만, 1=통계만) |
| `recentWindow` | `30` | 최근 N회 빈도 계산 윈도우 |

### 선택 — 콜백
| 옵션 | 설명 |
|------|------|
| `onProgress(percent, stats)` | 진행률 0~100, stats 객체 |
| `onRound(roundNum, bestScore, scoreHistory)` | 라운드 완료마다 호출 |
| `onComplete(result)` | 최종 완료 시 호출 |

---

## 반환값 (Result)

```javascript
{
    results: [
        [3, 14, 22, 33, 38, 44],  // 1위 추천
        [7, 18, 25, 31, 40, 43],  // 2위
        ...
    ],
    scores: [98.23, 95.41, ...],  // 각 조합 점수

    probMap: {                    // 번호별 ML+통계 블렌딩 확률
        1: 0.182,
        2: 0.134,
        ...
        45: 0.201
    },

    scoreHistory: [72.1, 74.3, ...], // v2.1.0: 라운드별 최고점수 배열

    stat: {                          // v2.1.0: StatCache
        freq      : { 1:12, 2:8, ... },
        recentFreq: { 1:3, 2:1, ... },
        gap       : { 1:4, 2:12, ... },
        reHit     : { 1:2, 2:0, ... }
    },

    meta: {
        items: 45,
        pick: 6,
        rounds: 50,
        historySize: 1017,
        elapsed: 12340,
        generatedAt: "2026-02-16T...",
        version: "2.1.0"
    }
}
```

---

## 프리셋

```javascript
CubeEngine.presets.lotto645     // 한국 로또 6/45
CubeEngine.presets.lotto638     // 로또 6/38
CubeEngine.presets.powerball    // 미국 파워볼
CubeEngine.presets.megamillions // 메가밀리언
CubeEngine.presets.euromillions // 유로밀리언
CubeEngine.presets.keno         // 키노
CubeEngine.presets.fast         // 빠른 테스트
CubeEngine.presets.turbo        // 초고속 테스트

// 프리셋 + 내 설정 합치기
const cfg = CubeEngine.withPreset('lotto645', {
    history: myHistory,
    topN: 10,
    statWeight: 0.4  // 통계 비중 높임
});
const result = await CubeEngine.generate(cfg);
```

---

## 실전 예시

### 1. 기본 (데이터 없이)
```javascript
const result = await CubeEngine.generate({ items: 45, pick: 6 });
console.log(result.results[0]);
```

### 2. 과거 데이터 포함
```javascript
const result = await CubeEngine.generate({
    items  : 45,
    pick   : 6,
    history: myHistory
});
```

### 3. 학습 모니터링 연동 (v2.1.0)
```javascript
const result = await CubeEngine.generate({
    items  : 45,
    pick   : 6,
    history: myHistory,
    statWeight: 0.35,

    onProgress: function(pct, stats) {
        if (stats.phase === 'ml_done') {
            // StatCache 즉시 활용 가능
            console.log('가장 많이 나온 번호:', stats.statCache);
        }
        if (stats.phase === 'evolving') {
            console.log('라운드', stats.round, '| 점수 추이', stats.scoreHistory);
            console.log('상위 번호', stats.topItems);
        }
    }
});

// StatCache 직접 접근
const stat = result.stat;
console.log('출현 간격 가장 긴 번호:', Object.entries(stat.gap).sort((a,b)=>b[1]-a[1])[0]);
```

### 4. turbo 프리셋으로 빠른 테스트
```javascript
const result = await CubeEngine.generate(
    CubeEngine.withPreset('turbo', { history: myHistory })
);
```

---

## onProgress stats 객체 상세 (v2.1.0)

| phase | 설명 | 추가 필드 |
|-------|------|----------|
| `'stat'` | StatCache 계산 시작 | `message` |
| `'ml'` | ML 모델 계산 시작 | `message` |
| `'ml_done'` | ML+통계 완료 | `message`, `statCache` |
| `'evolving'` | 라운드 진행 중 | `round`, `totalRounds`, `poolSize`, `bestScore`, `scoreHistory`, `probMap`, `topItems`, `cubeResults`, `noImprove`, `elapsed` |
| `'done'` | 완료 | `message` |

---

## 알고리즘 설명

### 큐브 진화 (Hybrid Cube Evolution)

각 번호(1~N)를 **독립적인 에이전트**로 보고,  
`evolveTime`(ms) 동안 또는 `loopMin` 횟수만큼 아래를 반복합니다:

```
1. 현재 확률(adaptiveProb)로 성공/실패 판정
2. 매 100번마다 실제 적중률 측정
3. 목표 확률(initialProb)과 차이를 보정 → adaptiveProb 자동 조정
4. 누적 성공 횟수가 해당 번호의 최종 점수
```

### ML 확률 모델 (v2.0)

```
초기값:  sin(x) + cos(x/2)      ← 수학 기반 다양성
가중치:  exp(-lambda * 거리)     ← 최근 회차일수록 강하게
업데이트: gradient descent        ← sigmoid 예측 오차 보정
```

### StatCache + WeightedProb (v2.1.0 신규)

```
freq      (전체 빈도)         × 0.30
recentFreq (최근 N회 빈도)    × 0.30
gap       (출현 간격 길수록↑) × 0.20
reHit     (연속 재출현 횟수)  × 0.20
                                ──────
                               통계 확률

ML 확률 × (1 - statWeight) + 통계 확률 × statWeight → 최종 probMap
```

### historySet O(1) 최적화 (v2.1.0 신규)

기존 `isTooSimilar()` 함수는 매 후보마다 history 전체를 순회 O(N).  
v2.1.0에서는 history를 `Set<JSON string>`으로 사전 변환해 O(1) 체크.  
poolSize=2500 기준 **후보 생성 루프 속도 대폭 향상**.

---

## 파일 구성

```
cube-engine.js   ← 엔진 (의존성 없음)
index.html       ← 학습 상태 모니터링 대시보드 (Firebase 연동)
```

---

## 버전 히스토리

| 버전 | 날짜 | 주요 내용 |
|------|------|----------|
| 1.0.0 | - | 최초 릴리즈. 범용화, 프리셋, 콜백, CommonJS/브라우저 지원 |
| 1.1.0 | - | reportProgress 타이밍 수정 — 라운드 완료 후 즉시 반영 |
| 1.1.1 | - | 기본값 변경: evolveTime 150, loopMin 5000, poolSize 3000 |
| 1.1.2 | - | 기본값 추가 조정 |
| 1.2.1 | - | 기본값 추가 조정 |
| 2.0.0 | - | 구조 개편: 범위 설정(rangeStart/End), 제외숫자(excludeNumbers), Firebase 연동, 적응형 학습률, 라운드별 probMap 동적 갱신 |
| 2.0.1 | - | 진화 루프 적응 주기 1000→100으로 단축, topCandidatePool 파라미터 추가 |
| **2.1.0** | **2026-02-16** | **① buildStatCache() 추가 — freq/recentFreq/gap/reHit 사전 계산** |
|       |      | **② buildWeightedProb() 추가 — 통계 기반 확률 레이어 (statWeight 옵션)** |
|       |      | **③ historySet 도입 — isTooSimilar O(N) → O(1) 대체, 후보 생성 속도 향상** |
|       |      | **④ onProgress stats 확장 — scoreHistory, probMap, topItems, cubeResults 실시간 전달** |
|       |      | **⑤ onRound 시그니처 변경 — scoreHistory 3번째 인자 추가** |
|       |      | **⑥ result에 scoreHistory, stat 필드 추가** |
|       |      | **⑦ index.html 학습 상태 모니터링 대시보드로 전면 개편** |
|       |      | **⑧ meta.version 필드 추가** |
| **2.1.1** | **2026-02-16** | **index.html 대시보드 개선 (3건)** |
|       |      | **① poolSize 슬라이더 추가 — 100~10,000 범위, 100 단위 조절 가능** |
|       |      | **② 로또 웹 당첨 히스토리 연동 — lotto_history/lotto645_history→draws 실제 로드 후 엔진에 전달 (기존 누락)** |
|       |      | **③ 실행 시 단계별 상태 표시 — "당첨 데이터 로딩 중" → "학습 상태 로딩 중" → "엔진 실행" 순으로 명확화** |
|       |      | **④ path-box에 당첨 히스토리 경로/상태 행 추가 — 초기 로드 시 회차수 사전 확인** |
|       |      | **⑤ renderStat — numbers 배열/2D 배열 양쪽 형태 모두 수용하도록 수정** |

| **2.2.0** | **2026-02-16** | **실제 당첨 데이터 기반 학습 강화** |
|       |      | **① buildStatCache() — 색상 구역(1-10 노랑/11-20 파랑/21-30 빨강/31-40 회색/41-45 초록) 빈도·간격 사전 계산** |
|       |      | **② buildWeightedProb() — bonusHistory(보너스 번호 배열) 학습 추가. 보너스 번호가 자주 나온 번호에 확률 가중** |
|       |      | **③ scoreCombo() — colorZoneWeight(색상 구역 균형 점수) 추가. 3~4구역 분포 조합에 가산점, 1구역 집중 시 감점** |
|       |      | **④ 신규 옵션: bonusHistory(null), bonusWeight(0.15), colorZoneWeight(0.20)** |
|       |      | **⑤ recommend.js — bonusNums 추출 후 bonusHistory로 엔진 전달, colorZoneWeight 활성화** |
|       |      | **[기존 방법 유지] history 기반 ML·StatCache·historySet 모두 그대로 동작** |
