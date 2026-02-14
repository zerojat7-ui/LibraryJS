# CubeEngine v2.0.0 - 사용 가이드

> **📌 이제 cube-engine.js 하나로 모든 기능 사용 가능!**

## 🎯 주요 기능

### 1️⃣ **제외 숫자 (excludeNumbers)**

특정 번호를 제외하고 추출

### 2️⃣ **구간 설정 (rangeStart, rangeEnd)**

10~100 같은 범위에서만 추출

### 3️⃣ **다양한 게임 프리셋**

로또, 파워볼, 유로밀리언, 키노 등

### 4️⃣ **Firebase 연동**

학습 데이터 영속화 지원

-----

## 📖 사용 예제

### 예제 1: 로또 6/45 기본

```javascript
const result = await CubeEngine.generate({
    items: 45,
    pick: 6
});

console.log(result.results); // [[1,7,15,23,31,42], ...]
```

-----

### 예제 2: 제외 숫자 사용

```javascript
// 2, 5, 17번 제외하고 추출
const result = await CubeEngine.generate({
    items: 45,
    pick: 6,
    excludeNumbers: [2, 5, 17]  // ✅ 이 번호들은 절대 안나옴
});
```

-----

### 예제 3: 구간 설정

```javascript
// 10~30 구간에서만 6개 추출
const result = await CubeEngine.generate({
    items: 45,      // 전체 범위는 45지만
    pick: 6,
    rangeStart: 10, // ✅ 10번부터
    rangeEnd: 30    // ✅ 30번까지만 사용
});

// 결과 예: [12, 15, 19, 22, 27, 30]
```

-----

### 예제 4: 제외 + 구간 동시 사용

```javascript
// 10~50 구간에서 3, 15, 27 제외하고 추출
const result = await CubeEngine.generate({
    items: 100,
    pick: 5,
    rangeStart: 10,
    rangeEnd: 50,
    excludeNumbers: [3, 15, 27]
});
```

-----

### 예제 5: 프리셋 사용

```javascript
// 로또 6/45
const lotto = await CubeEngine.generate(
    CubeEngine.presets.lotto645
);

// 미국 파워볼
const powerball = await CubeEngine.generate(
    CubeEngine.presets.powerball
);

// 키노 (80개 중 20개)
const keno = await CubeEngine.generate(
    CubeEngine.presets.keno
);
```

-----

### 예제 6: 프리셋 + 커스텀 옵션

```javascript
// 로또 프리셋에 제외숫자 추가
const result = await CubeEngine.generate(
    CubeEngine.withPreset('lotto645', {
        excludeNumbers: [7, 13, 21],
        history: pastDraws  // 과거 당첨번호
    })
);
```

-----

### 예제 7: 과거 데이터 학습

```javascript
const pastDraws = [
    [3, 12, 18, 25, 34, 41],
    [5, 9, 17, 22, 38, 44],
    // ... 더 많은 과거 당첨번호
];

const result = await CubeEngine.generate({
    items: 45,
    pick: 6,
    history: pastDraws,  // ✅ ML 학습에 사용
    excludeNumbers: [13] // 13번 제외
});
```

-----

### 예제 8: Firebase 연동

```javascript
// 이전 학습 데이터 로드
const savedData = await firebase.get('engine_data');

const result = await CubeEngine.generate({
    items: 45,
    pick: 6,
    externalProbMap: savedData.probMap,   // 저장된 확률맵
    initialPool: savedData.pool,          // 이전 세대 풀
    persistenceWeight: 0.7                // 70% 유지
});

// 결과 저장
await firebase.save({
    probMap: result.probMap,
    pool: result.fullPool
});
```

-----

### 예제 9: 진행상황 모니터링

```javascript
const result = await CubeEngine.generate({
    items: 45,
    pick: 6,
    
    onProgress: (percent, stats) => {
        console.log(`진행: ${percent}%`);
        console.log(`라운드: ${stats.round}/${stats.totalRounds}`);
        console.log(`최고점수: ${stats.bestScore}`);
    },
    
    onRound: (roundNum, bestScore) => {
        console.log(`라운드 ${roundNum} 완료: ${bestScore}`);
    }
});
```

-----

## 🎮 게임별 프리셋

```javascript
// 한국 로또 6/45
CubeEngine.presets.lotto645

// 한국 로또 6/38 (과거)
CubeEngine.presets.lotto638

// 미국 파워볼
CubeEngine.presets.powerball

// 미국 메가밀리언
CubeEngine.presets.megamillions

// 유럽 유로밀리언
CubeEngine.presets.euromillions

// 키노 (80개 중 20개)
CubeEngine.presets.keno

// 빠른 테스트용
CubeEngine.presets.fast

// 완전 커스텀
CubeEngine.presets.custom
```

-----

## ⚙️ 전체 옵션

```javascript
const result = await CubeEngine.generate({
    // ── 필수 ──
    items: 45,          // 전체 아이템 개수
    pick: 6,            // 선택할 개수
    
    // ── 범위 제어 ──
    rangeStart: 10,     // 시작 번호 (null이면 1부터)
    rangeEnd: 40,       // 끝 번호 (null이면 items까지)
    excludeNumbers: [13, 27], // 제외할 번호들
    
    // ── 학습 데이터 ──
    history: [[...], [...]],  // 과거 당첨번호
    
    // ── Firebase 연동 ──
    externalProbMap: {...},   // 저장된 확률맵
    initialPool: [[...], ...], // 이전 세대 풀
    persistenceWeight: 0.7,    // 기존 지식 유지율
    
    // ── 엔진 튜닝 ──
    lambda: 0.18,        // 시간 가중치
    learningRate: 0.05,  // ML 학습률
    evolveTime: 80,      // 진화 시간(ms)
    rounds: 50,          // 라운드 수
    poolSize: 2500,      // 후보 풀 크기
    topN: 5,             // 최종 결과 개수
    threshold: 5,        // 유사도 임계값
    
    // ── 콜백 ──
    onProgress: (percent, stats) => {},
    onRound: (round, score) => {},
    onComplete: (result) => {}
});
```

-----

## 📦 결과 구조

```javascript
{
    results: [          // 추천 조합들
        [1, 7, 15, 23, 31, 42],
        [3, 12, 18, 27, 35, 41],
        // ...
    ],
    scores: [           // 각 조합의 점수
        487.32,
        452.18,
        // ...
    ],
    probMap: {          // 번호별 확률
        1: 0.142,
        2: 0.089,
        // ...
    },
    fullPool: [...],    // 전체 후보 풀 (Firebase 저장용)
    meta: {             // 메타데이터
        items: 45,
        pick: 6,
        validPoolSize: 42,      // 유효 번호 개수
        excludedCount: 3,       // 제외된 번호 개수
        rangeStart: 1,
        rangeEnd: 45,
        elapsed: 12583,         // 소요시간(ms)
        historySize: 1105,      // 학습 데이터 크기
        generatedAt: "2025-02-14T08:30:00.000Z"
    }
}
```

-----

## 🚨 오류 처리

```javascript
try {
    const result = await CubeEngine.generate({
        items: 45,
        pick: 6,
        rangeStart: 40,
        rangeEnd: 43,
        excludeNumbers: [40, 41, 42, 43]  // ❌ 유효 번호 0개!
    });
} catch(error) {
    console.error(error.message);
    // "유효한 번호가 부족합니다. (필요:6, 가능:0)"
}
```

-----

## 💡 실전 활용 예제

### 로또 반자동 번호

```javascript
// 사용자가 3개 선택 (7, 15, 23)
// 나머지 3개는 AI가 추천 (10~40 구간, 13 제외)

const result = await CubeEngine.generate({
    items: 45,
    pick: 3,              // 3개만 추출
    rangeStart: 10,
    rangeEnd: 40,
    excludeNumbers: [7, 15, 23, 13],  // 사용자 선택 + 제외
    history: pastDraws
});

const final = [7, 15, 23, ...result.results[0]].sort((a,b) => a-b);
// [7, 12, 15, 23, 28, 35]
```

-----

## 🎯 요약

|기능          |옵션                            |예제        |
|------------|------------------------------|----------|
|**제외 숫자**   |`excludeNumbers: [2,5,17]`    |특정 번호 안나오게|
|**구간 설정**   |`rangeStart: 10, rangeEnd: 30`|10~30만 사용 |
|**게임 프리셋**  |`CubeEngine.presets.powerball`|파워볼 설정    |
|**과거 학습**   |`history: [[...], [...]]`     |ML 학습     |
|**Firebase**|`externalProbMap, initialPool`|학습 영속화    |

-----

**버전:** v1.3.0-universal  
**라이선스:** MIT  
**제작:** CubeEngine Team