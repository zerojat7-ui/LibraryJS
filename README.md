# CubeEngine v1.0.0

> Hybrid Cube Evolution × ML Probability Engine  
> 범용 확률 기반 조합 추천 라이브러리

---

## 핵심 개념

```
과거 데이터 학습 (선택)
    ↓
ML 확률 모델 구성 (sigmoid + 가중치)
    ↓
각 항목을 독립적으로 큐브 진화
    ↓
5000개 조합 생성 × N 라운드
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
| `evolveTime` | `800` | 각 번호 진화 시간 (ms). **클수록 정밀, 오래 걸림** |
| `loopMin` | `30000` | 최소 반복 횟수. evolveTime 미달 시 이 횟수까지 계속 |
| `rounds` | `50` | 전체 진화 라운드. **클수록 다양한 조합 탐색** |
| `poolSize` | `5000` | 라운드당 조합 생성 수. **클수록 좋은 조합 발견 가능성↑** |

> **속도 조절 팁**
> - 빠르게 테스트: `evolveTime:200, loopMin:5000, rounds:10, poolSize:500`
> - 정밀 분석: `evolveTime:2000, loopMin:80000, rounds:100, poolSize:10000`

### 선택 — 결과
| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `topN` | `5` | 최종 반환 조합 수 |
| `lambda` | `0.18` | 최근 데이터 가중치 감쇠율 (클수록 최근 중시) |
| `learningRate` | `0.05` | ML 업데이트 강도 |

### 선택 — 콜백
| 옵션 | 설명 |
|------|------|
| `onProgress(percent, stats)` | 진행률 0~100, stats 객체 |
| `onRound(roundNum, bestScore)` | 라운드 완료마다 호출 |
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

    probMap: {                    // 번호별 ML 확률
        1: 0.182,
        2: 0.134,
        ...
        45: 0.201
    },

    meta: {
        items: 45,
        pick: 6,
        rounds: 50,
        poolSize: 5000,
        historySize: 1017,        // 과거 데이터 수
        elapsed: 12340,           // 소요 시간 (ms)
        generatedAt: "2026-02-13T..."
    }
}
```

---

## 프리셋

자주 쓰는 게임 설정을 미리 정의해뒀습니다.

```javascript
// 프리셋 목록
CubeEngine.presets.lotto645  // 한국 로또 6/45
CubeEngine.presets.powerball // 미국 파워볼
CubeEngine.presets.bingo     // 빙고
CubeEngine.presets.fast      // 빠른 테스트
CubeEngine.presets.precise   // 정밀 분석

// 프리셋 + 내 설정 합치기
const cfg = CubeEngine.withPreset('lotto645', {
    history: myHistory,
    topN: 10
});
const result = await CubeEngine.generate(cfg);
```

---

## 실전 예시

### 1. 기본 (데이터 없이)
```javascript
const result = await CubeEngine.generate({
    items: 45,
    pick: 6
});
console.log(result.results[0]); // [7, 14, 23, 31, 38, 42]
```

---

### 2. 과거 데이터 포함
```javascript
const history = [
    [10, 23, 29, 33, 37, 40],
    [9, 13, 21, 25, 32, 42],
    // ... 1000회차 데이터
];

const result = await CubeEngine.generate({
    items  : 45,
    pick   : 6,
    history: history
});
```

---

### 3. 프로그레스 바 연동
```javascript
const progressBar = document.getElementById('progressBar');
const statusText  = document.getElementById('statusText');

const result = await CubeEngine.generate({
    items  : 45,
    pick   : 6,
    history: history,

    onProgress: function(percent, stats) {
        progressBar.style.width = percent + '%';

        if (stats.phase === 'ml')       statusText.textContent = 'ML 모델 계산 중...';
        if (stats.phase === 'evolving') statusText.textContent =
            stats.round + '/' + stats.totalRounds + ' 라운드 | ' +
            '후보: ' + stats.poolSize + ' | ' +
            '경과: ' + (stats.elapsed/1000).toFixed(1) + 's';
        if (stats.phase === 'done')     statusText.textContent = '완료!';
    },

    onRound: function(roundNum, bestScore) {
        console.log('라운드 ' + roundNum + ' 완료, 최고점: ' + bestScore);
    }
});
```

---

### 4. 빠른 테스트 (fast 프리셋)
```javascript
// 설정값만 바꿔서 2~3초 안에 결과 확인
const result = await CubeEngine.generate(
    CubeEngine.withPreset('fast', { items: 45, pick: 6 })
);
```

---

### 5. 미국 파워볼
```javascript
const result = await CubeEngine.generate(
    CubeEngine.withPreset('powerball', {
        history: powerballHistory
    })
);
```

---

### 6. 커스텀 루프 제어
```javascript
// 모바일에서 가볍게
const result = await CubeEngine.generate({
    items      : 45,
    pick       : 6,
    evolveTime : 300,   // 300ms로 줄임
    loopMin    : 10000, // 최소 1만 회
    rounds     : 20,    // 20라운드만
    poolSize   : 1000   // 라운드당 1000개
});

// PC에서 정밀하게
const result2 = await CubeEngine.generate({
    items      : 45,
    pick       : 6,
    evolveTime : 3000,  // 3초
    loopMin    : 100000,
    rounds     : 100,
    poolSize   : 10000
});
```

---

### 7. 로또 앱에 통합
```javascript
// history.json 로드 후 바로 사용
fetch('history.json')
    .then(r => r.json())
    .then(async data => {
        const history = data.map(d => d.numbers);

        const result = await CubeEngine.generate(
            CubeEngine.withPreset('lotto645', {
                history,
                topN: 5,
                onProgress: (pct) => {
                    document.getElementById('bar').style.width = pct + '%';
                }
            })
        );

        result.results.forEach(combo => {
            console.log(combo.join(', '));
        });
    });
```

---

## onProgress stats 객체 상세

| phase | 설명 | 추가 필드 |
|-------|------|----------|
| `'ml'` | ML 모델 계산 시작 | `message` |
| `'ml_done'` | ML 완료, 진화 시작 | `message` |
| `'evolving'` | 라운드 진행 중 | `round`, `totalRounds`, `poolSize`, `bestScore`, `elapsed` |
| `'done'` | 완료 | `message` |

---

## 알고리즘 설명

### 큐브 진화 (Hybrid Cube Evolution)

각 번호(1~N)를 **독립적인 에이전트**로 보고,  
`evolveTime`(ms) 동안 또는 `loopMin` 횟수만큼 아래를 반복합니다:

```
1. 현재 확률(adaptiveProb)로 성공/실패 판정
2. 매 1000번마다 실제 적중률 측정
3. 목표 확률(initialProb)과 차이를 보정 → adaptiveProb 자동 조정
4. 누적 성공 횟수가 해당 번호의 최종 점수
```

→ 과거에 자주 나온 번호일수록 `initialProb`가 높게 시작  
→ 진화 과정에서 안정적으로 높은 점수를 받으면 최종 선택 확률 높아짐

### ML 확률 모델

```
초기값:  sin(x) + cos(x/2)   ← 수학 기반 다양성
가중치:  exp(-lambda * 거리)  ← 최근 회차일수록 강하게
업데이트: gradient descent     ← sigmoid 예측 오차 보정
```

---

## 파일 하나로 끝

외부 의존성 없음. `cube-engine.js` 파일 하나만 있으면 됩니다.

```
cube-engine.js   ← 이것만!
```

---

## 버전

| 버전 | 내용 |
|------|------|
| 1.0.0 | 최초 릴리즈. 범용화, 프리셋, 콜백, CommonJS/AMD/브라우저 지원 |


## 버전

| 버전 | 내용 |
|------|------|
| 1.1.0 | reportProgress 타이밍 문제
라운드 시작 시점에만 progress가 보고되고, 진화가 끝난 후엔 보고가 없었습니다.
→ 라운드 완료 후에도 progress를 재보고해서 숫자가 즉시 반영됩니다. |
