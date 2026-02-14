/**

- ╔══════════════════════════════════════════════════════════╗
- ║              CubeEngine  v2.0.0  (Universal)             ║
- ║   Hybrid Cube Evolution × ML Probability Engine          ║
- ║   범용 추첨 엔진 - 제외숫자 & 구간설정 지원              ║
- ╚══════════════════════════════════════════════════════════╝
  */

(function(global) {
‘use strict’;

```
var DEFAULTS = {
    // ── 기본 설정 (필수) ──
    items     : 45,           // 전체 아이템 수 (1~items)
    pick      : 6,            // 선택할 개수
    
    // ── 범위 설정 (옵션) ──
    rangeStart: null,         // 시작 번호 (null이면 1부터)
    rangeEnd  : null,         // 끝 번호 (null이면 items까지)
    excludeNumbers: null,     // 제외할 번호 배열 [2,5,17] 또는 null
    
    // ── 학습 데이터 (옵션) ──
    history   : null,         // 과거 당첨 데이터 [[1,2,3...], ...]
    
    // ── Firebase 연동 (옵션) ──
    externalProbMap : null,   // Firebase에서 로드한 확률 맵
    initialPool     : null,   // Firebase에서 로드한 이전 세대 풀
    persistenceWeight: 0.7,   // 기존 지식 유지 비율 (0.0~1.0)
    
    // ── ML & 진화 파라미터 ──
    lambda    : 0.18,
    learningRate: 0.05,
    evolveTime : 80,
    loopMin    : 1000,
    rounds     : 50,
    poolSize   : 2500,
    topN      : 5,
    threshold : 5,
    topCandidatePool: 15,
    
    // ── 콜백 ──
    onProgress: null,
    onRound   : null,
    onComplete: null,
};

function baseScore(x) { return Math.sin(x) + Math.cos(x / 2); }
function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

// ── 유효 번호 풀 생성 (제외숫자 & 구간 적용) ──
function buildValidPool(cfg) {
    var start = cfg.rangeStart !== null ? cfg.rangeStart : 1;
    var end   = cfg.rangeEnd !== null ? cfg.rangeEnd : cfg.items;
    var exclude = cfg.excludeNumbers || [];
    var excludeSet = new Set(exclude);
    
    var pool = [];
    for (var i = start; i <= end; i++) {
        if (!excludeSet.has(i)) {
            pool.push(i);
        }
    }
    
    return pool;
}

// ── ML 확률 모델 (범용화 + 구간/제외 적용) ──
function buildMLProbabilities(cfg, validPool) {
    var n = validPool.length;
    var scores = {};
    
    // 초기 점수
    validPool.forEach(function(num) {
        scores[num] = baseScore(num);
    });

    // 과거 데이터 학습
    if (cfg.history && cfg.history.length > 0) {
        var total = cfg.history.length;
        cfg.history.forEach(function(draw, index) {
            var distance = total - index - 1;
            var weight = Math.exp(-cfg.lambda * distance);
            draw.forEach(function(num) {
                if (scores[num] !== undefined) {
                    scores[num] += weight;
                }
            });
        });

        cfg.history.forEach(function(draw) {
            validPool.forEach(function(num) {
                var predicted = sigmoid(scores[num]);
                var actual = draw.indexOf(num) >= 0 ? 1 : 0;
                scores[num] += cfg.learningRate * (actual - predicted);
            });
        });
    }

    // Sigmoid 정규화
    var probMap = {};
    validPool.forEach(function(num) {
        probMap[num] = sigmoid(scores[num]);
    });

    // 외부 확률 맵 블렌딩 (Firebase)
    if (cfg.externalProbMap) {
        validPool.forEach(function(num) {
            if (cfg.externalProbMap[num] !== undefined) {
                var savedP = cfg.externalProbMap[num];
                var blended = (savedP * cfg.persistenceWeight) + 
                              (probMap[num] * (1 - cfg.persistenceWeight));
                probMap[num] = Math.min(Math.max(blended, 0.01), 0.95);
            }
        });
    }

    // 스케일 조정
    var avg = 0;
    validPool.forEach(function(num) { avg += probMap[num]; });
    avg /= n;
    var scale = (cfg.pick / n) / avg;
    validPool.forEach(function(num) {
        probMap[num] = Math.min(probMap[num] * scale, 1);
    });

    return probMap;
}

async function evolveHybridCube(itemNum, initialProb, cfg) {
    var adaptiveProb = initialProb;
    var score = 0, success = 0, total = 0;
    var start = performance.now();
    while (performance.now() - start < cfg.evolveTime || total < cfg.loopMin) {
        total++;
        if (Math.random() < adaptiveProb) { success++; score++; }
        if (total % 500 === 0) {
            var currentRate = success / total;
            adaptiveProb += (initialProb - currentRate) * 0.1;
            adaptiveProb = Math.min(Math.max(adaptiveProb, 0.01), 0.95);
        }
    }
    return { item: itemNum, score: score, finalProb: adaptiveProb };
}

function isTooSimilar(picked, history, threshold) {
    if (!history || !history.length) return false;
    for (var i = 0; i < history.length; i++) {
        var match = 0;
        for (var j = 0; j < picked.length; j++) {
            if (history[i].indexOf(picked[j]) >= 0) match++;
        }
        if (match >= threshold) return true;
    }
    return false;
}

function scoreCombo(combo, probMap, cfg) {
    var score = 0;
    combo.forEach(function(item) { 
        score += (probMap[item] || 0) * 100; 
    });
    var mean = combo.reduce(function(a, b) { return a + b; }, 0) / combo.length;
    var variance = combo.reduce(function(s, x) { 
        return s + Math.pow(x - mean, 2); 
    }, 0) / combo.length;
    score += Math.sqrt(variance) * 0.5;
    return score;
}

// ── 메인 생성 함수 ──
async function generate(options) {
    var cfg = {};
    Object.keys(DEFAULTS).forEach(function(k) { cfg[k] = DEFAULTS[k]; });
    if (options) Object.keys(options).forEach(function(k) { cfg[k] = options[k]; });

    var startTime = performance.now();
    
    // 유효 번호 풀 생성
    var validPool = buildValidPool(cfg);
    
    if (validPool.length < cfg.pick) {
        throw new Error('유효한 번호가 부족합니다. (필요:' + cfg.pick + ', 가능:' + validPool.length + ')');
    }

    var pool = [];

    function reportProgress(pct, stats) {
        if (typeof cfg.onProgress === 'function') cfg.onProgress(Math.round(pct), stats || {});
    }

    reportProgress(0, { phase: 'ml', message: 'ML 확률 모델 계산 중...' });
    var probMap = buildMLProbabilities(cfg, validPool);

    reportProgress(3, { phase: 'ml_done', message: 'ML 모델 완료' });

    // Firebase 초기 Pool 주입
    if (cfg.initialPool && Array.isArray(cfg.initialPool)) {
        cfg.initialPool.forEach(function(items) {
            var arr = items.slice().sort(function(a, b) { return a - b; });
            // 유효성 검증
            var valid = arr.every(function(n) { return validPool.indexOf(n) >= 0; });
            if (valid) {
                pool.push({ items: arr, score: scoreCombo(arr, probMap, cfg) });
            }
        });
    }

    reportProgress(5, { 
        phase: 'evolving', 
        message: '진화 시작...', 
        round: 0, 
        totalRounds: cfg.rounds, 
        poolSize: pool.length, 
        bestScore: 0 
    });

    for (var round = 0; round < cfg.rounds; round++) {
        await new Promise(function(r) { setTimeout(r, 0); });

        // 큐브 진화
        var cubeResults = await Promise.all(
            validPool.map(function(num) {
                return evolveHybridCube(num, probMap[num], cfg);
            })
        );
        cubeResults.sort(function(a, b) { return b.score - a.score; });
        var topItems = cubeResults.map(function(r) { return r.item; });

        // 후보 생성
        var candidates = [];
        for (var ci = 0; ci < cfg.poolSize; ci++) {
            var combo = new Set();
            var mustCount = Math.min(2 + Math.floor(Math.random() * 2), cfg.pick);
            
            // 상위 아이템 우선 선택
            for (var m = 0; m < mustCount && combo.size < cfg.pick; m++) {
                combo.add(topItems[Math.floor(Math.random() * Math.min(cfg.topCandidatePool, topItems.length))]);
            }
            
            // 확률 기반 채우기
            var att = 0;
            while (combo.size < cfg.pick && att++ < 300) {
                var randIdx = Math.floor(Math.random() * validPool.length);
                var num = validPool[randIdx];
                if (Math.random() < probMap[num] * 3) combo.add(num);
            }
            
            // 랜덤 채우기
            while (combo.size < cfg.pick) {
                combo.add(validPool[Math.floor(Math.random() * validPool.length)]);
            }

            var arr = Array.from(combo).sort(function(a, b) { return a - b; });
            if (!isTooSimilar(arr, cfg.history, cfg.threshold)) {
                candidates.push({ items: arr, score: scoreCombo(arr, probMap, cfg) });
            }
        }

        candidates.sort(function(a, b) { return b.score - a.score; });
        candidates.slice(0, 10).forEach(function(c) { pool.push(c); });

        // 풀 관리
        pool.sort(function(a, b) { return b.score - a.score; });
        if (pool.length > 500) pool = pool.slice(0, 500);

        reportProgress(5 + ((round + 1) / cfg.rounds) * 95, {
            phase: 'evolving',
            round: round + 1,
            totalRounds: cfg.rounds,
            poolSize: pool.length,
            bestScore: pool.length > 0 ? pool[0].score : 0,
            elapsed: Math.round(performance.now() - startTime)
        });

        if (typeof cfg.onRound === 'function') cfg.onRound(round + 1, pool[0]?.score);
    }

    reportProgress(100, { phase: 'done', message: '완료!' });

    // 최종 결과 중복 제거
    var topResults = [];
    var dedupeThreshold = Math.max(3, cfg.pick - 1);
    for (var ri = 0; ri < pool.length && topResults.length < cfg.topN; ri++) {
        var candidate = pool[ri];
        var isDup = topResults.some(function(tr) {
            var overlap = candidate.items.filter(function(n) { 
                return tr.items.indexOf(n) >= 0; 
            }).length;
            return overlap >= dedupeThreshold;
        });
        if (!isDup) topResults.push(candidate);
    }

    var result = {
        results : topResults.map(function(r) { return r.items; }),
        scores  : topResults.map(function(r) { return Math.round(r.score * 100) / 100; }),
        probMap : probMap,
        fullPool: pool.map(function(p) { return p.items; }),
        meta: {
            items: cfg.items,
            pick: cfg.pick,
            rounds: cfg.rounds,
            validPoolSize: validPool.length,
            excludedCount: cfg.excludeNumbers ? cfg.excludeNumbers.length : 0,
            rangeStart: cfg.rangeStart || 1,
            rangeEnd: cfg.rangeEnd || cfg.items,
            elapsed: Math.round(performance.now() - startTime),
            historySize: cfg.history ? cfg.history.length : 0,
            generatedAt: new Date().toISOString()
        }
    };

    if (typeof cfg.onComplete === 'function') cfg.onComplete(result);
    return result;
}

var CubeEngine = {
    generate: generate,
    defaults: DEFAULTS,
    
    // ✅ 다양한 게임 프리셋
    presets: {
        // 로또류
        lotto645: { 
            items: 45, pick: 6, threshold: 5, 
            evolveTime: 80, rounds: 50, poolSize: 2500 
        },
        lotto638: { 
            items: 38, pick: 6, threshold: 5, 
            evolveTime: 80, rounds: 50, poolSize: 2500 
        },
        
        // 파워볼류 (미국)
        powerball: { 
            items: 69, pick: 5, threshold: 4, 
            evolveTime: 100, rounds: 60, poolSize: 3000 
        },
        megamillions: { 
            items: 70, pick: 5, threshold: 4, 
            evolveTime: 100, rounds: 60, poolSize: 3000 
        },
        
        // 유럽
        euromillions: { 
            items: 50, pick: 5, threshold: 4, 
            evolveTime: 90, rounds: 55, poolSize: 2800 
        },
        
        // 빙고/키노
        keno: { 
            items: 80, pick: 20, threshold: 15, 
            evolveTime: 150, rounds: 40, poolSize: 3500 
        },
        
        // 빠른 테스트용
        fast: { 
            items: 45, pick: 6, 
            evolveTime: 20, rounds: 5, poolSize: 500 
        },
        
        // 커스텀 (기본값 사용)
        custom: {}
    },
    
    // ✅ 프리셋 + 추가 옵션 병합
    withPreset: function(presetName, additionalOptions) {
        var preset = this.presets[presetName];
        if (!preset) {
            console.warn('Unknown preset: ' + presetName + ', using defaults');
            preset = {};
        }
        var merged = {};
        // Copy preset
        Object.keys(preset).forEach(function(k) { merged[k] = preset[k]; });
        // Override with additional options
        if (additionalOptions) {
            Object.keys(additionalOptions).forEach(function(k) { merged[k] = additionalOptions[k]; });
        }
        return merged;
    },
    
    version: '2.0.0'
};

if (typeof module !== 'undefined' && module.exports) module.exports = CubeEngine;
else global.CubeEngine = CubeEngine;
```

})(typeof globalThis !== ‘undefined’ ? globalThis : typeof window !== ‘undefined’ ? window : this);