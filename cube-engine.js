/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║              CubeEngine  v2.2.2  (Universal)             ║
 * ║   Hybrid Cube Evolution × ML Probability Engine          ║
 * ║   + StatCache · WeightedProb · ColorZone · Bonus v2.2.2  ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * v2.1.0: StatCache / WeightedProb / historySet O(1) / statWeight
 * v2.2.0: colorZone + bonusHistory 학습 / scoreCombo 색상균형 점수
 * v2.2.1: 라운드별 probMap 동적갱신 제거 (번호 쏠림 버그 수정)
 * v2.2.2: 랜덤 가중치(0.95~1.05) 적용 / 기당첨 완전일치 제외
 */

'use strict';

var DEFAULTS = {
    // ── 기본 설정 (필수) ──
    items     : 45,
    pick      : 6,

    // ── 범위 설정 (옵션) ──
    rangeStart: null,
    rangeEnd  : null,
    excludeNumbers: null,

    // ── 학습 데이터 (옵션) ──
    history   : null,

    // ── Firebase 연동 (옵션) ──
    externalProbMap : null,
    initialPool     : null,
    persistenceWeight: 0.7,

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

    // ── v2.1.0 신규 ──
    statWeight: 0.35,
    recentWindow: 30,

    // ── v2.2.0 신규 ──
    bonusHistory  : null,   // 보너스 번호 배열 [b1, b2, ...]
    bonusWeight   : 0.15,   // 보너스 빈도 기여 비율
    colorZoneWeight: 0.20,  // scoreCombo 색상 구역 균형 점수 비율

    // ── 콜백 ──
    onProgress: null,
    onRound   : null,
    onComplete: null,
};

/* ─────────────────────────────────────────
   기본 수학 유틸
───────────────────────────────────────── */
function baseScore(x) { return Math.sin(x) + Math.cos(x / 2); }
function sigmoid(x)   { return 1 / (1 + Math.exp(-x)); }

/* ─────────────────────────────────────────
   유효 풀 생성
───────────────────────────────────────── */
function buildValidPool(cfg) {
    var start = cfg.rangeStart !== null ? cfg.rangeStart : 1;
    var end   = cfg.rangeEnd   !== null ? cfg.rangeEnd   : cfg.items;
    var excludeSet = new Set(cfg.excludeNumbers || []);
    var pool = [];
    for (var i = start; i <= end; i++) {
        if (!excludeSet.has(i)) pool.push(i);
    }
    return pool;
}

/* ─────────────────────────────────────────
   v2.1.0 ① StatCache — 통계 사전 계산
   · freq      : 전체 출현 빈도
   · recentFreq: 최근 N회 가중 빈도
   · gap       : 마지막 출현 이후 경과 회차
   · reHit     : 연속 재출현 횟수
───────────────────────────────────────── */
function buildStatCache(history, cfg) {
    var freq      = {};
    var recentFreq = {};
    var gap       = {};
    var reHit     = {};
    var total     = history ? history.length : 0;
    var window    = cfg.recentWindow || 30;

    for (var i = 1; i <= cfg.items; i++) {
        freq[i] = 0; recentFreq[i] = 0; gap[i] = 0; reHit[i] = 0;
    }

    if (!history || history.length === 0) {
        return { freq: freq, recentFreq: recentFreq, gap: gap, reHit: reHit };
    }

    // 전체 빈도
    history.forEach(function(draw) {
        draw.forEach(function(n) { if (freq[n] !== undefined) freq[n]++; });
    });

    // 최근 N회 빈도
    var recent = history.slice(-window);
    recent.forEach(function(draw) {
        draw.forEach(function(n) { if (recentFreq[n] !== undefined) recentFreq[n]++; });
    });

    // 출현 간격 (마지막으로 나온 이후 몇 회 쉬었는지)
    for (var num = 1; num <= cfg.items; num++) {
        gap[num] = total; // 한번도 안 나왔으면 전체
        for (var j = total - 1; j >= 0; j--) {
            if (history[j].indexOf(num) >= 0) {
                gap[num] = total - j - 1;
                break;
            }
        }
    }

    // 재출현 확률 (연속 회차 재등장 횟수)
    for (var k = 1; k < history.length; k++) {
        var prev = history[k - 1];
        var curr = history[k];
        prev.forEach(function(n) {
            if (curr.indexOf(n) >= 0 && reHit[n] !== undefined) reHit[n]++;
        });
    }

    // ── v2.2.0: 색상 구역 (1-10노랑/11-20파랑/21-30빨강/31-40회색/41-45초록) ──
    var COLOR_ZONES = [
        {name:'yellow',min:1,max:10},{name:'blue',min:11,max:20},
        {name:'red',min:21,max:30},{name:'gray',min:31,max:40},{name:'green',min:41,max:45}
    ];
    var colorZone={}, zoneFreq={}, zoneGap={};
    COLOR_ZONES.forEach(function(z){zoneFreq[z.name]=0; zoneGap[z.name]=total;});
    for(var ci=1;ci<=cfg.items;ci++){
        COLOR_ZONES.forEach(function(z){if(ci>=z.min&&ci<=z.max) colorZone[ci]=z.name;});
    }
    if(history&&history.length>0){
        history.forEach(function(draw){
            COLOR_ZONES.forEach(function(z){
                if(draw.some(function(n){return n>=z.min&&n<=z.max;})) zoneFreq[z.name]++;
            });
        });
        for(var zi=total-1;zi>=0;zi--){
            COLOR_ZONES.forEach(function(z){
                if(zoneGap[z.name]===total&&history[zi].some(function(n){return n>=z.min&&n<=z.max;}))
                    zoneGap[z.name]=total-zi-1;
            });
        }
    }
    return { freq:freq, recentFreq:recentFreq, gap:gap, reHit:reHit,
             colorZone:colorZone, zoneFreq:zoneFreq, zoneGap:zoneGap, COLOR_ZONES:COLOR_ZONES };
}

/* ─────────────────────────────────────────
   v2.1.0 ② WeightedProb — 통계 기반 확률
   · freqScore  : 전체 빈도 30%
   · recentScore: 최근 빈도 30%
   · gapScore   : 출현 간격 (오래 쉰 번호 우대) 20%
   · reHitScore : 연속 재출현 가능성 20%
───────────────────────────────────────── */
function buildWeightedProb(cfg, validPool, stat) {
    var probMap   = {};
    var totalDraw = cfg.history ? cfg.history.length : 1;
    var window    = cfg.recentWindow || 30;
    var bw        = cfg.bonusWeight || 0.15;

    // 보너스 빈도
    var bonusFreq = {}; var bonusTotal = 0;
    validPool.forEach(function(n){bonusFreq[n]=0;});
    if(cfg.bonusHistory&&cfg.bonusHistory.length>0){
        bonusTotal = cfg.bonusHistory.length;
        cfg.bonusHistory.forEach(function(b){if(bonusFreq[b]!==undefined)bonusFreq[b]++;});
    }
    // 구역 간격 점수
    var zoneGapScore = {};
    if(stat.zoneGap&&stat.colorZone){
        validPool.forEach(function(n){
            var z=stat.colorZone[n];
            zoneGapScore[n]=z?Math.min((stat.zoneGap[z]||0)/10,1):0;
        });
    } else { validPool.forEach(function(n){zoneGapScore[n]=0;}); }

    validPool.forEach(function(n) {
        var freqScore   = stat.freq[n]       / totalDraw;
        var recentScore = stat.recentFreq[n] / window;
        var gapScore    = Math.min(stat.gap[n] / 20, 1);
        var reHitScore  = stat.reHit[n]      / totalDraw;
        var bonusScore  = bonusTotal>0 ? bonusFreq[n]/bonusTotal : 0;
        var zgScore     = zoneGapScore[n];
        probMap[n] =
            freqScore   * 0.25 +
            recentScore * 0.25 +
            gapScore    * 0.15 +
            reHitScore  * 0.15 +
            bonusScore  * bw   +
            zgScore     * 0.05;
    });
    return probMap;
}

/* ─────────────────────────────────────────
   ML 기반 확률 모델 (기존 + 통계 블렌딩)
───────────────────────────────────────── */
function buildMLProbabilities(cfg, validPool, stat) {
    var n      = validPool.length;
    var scores = {};

    validPool.forEach(function(num) { scores[num] = baseScore(num); });

    if (cfg.history && cfg.history.length > 0) {
        var total = cfg.history.length;
        cfg.history.forEach(function(draw, index) {
            var weight = Math.exp(-cfg.lambda * (total - index - 1));
            draw.forEach(function(num) {
                if (scores[num] !== undefined) scores[num] += weight;
            });
        });
        cfg.history.forEach(function(draw) {
            validPool.forEach(function(num) {
                var predicted = sigmoid(scores[num]);
                var actual    = draw.indexOf(num) >= 0 ? 1 : 0;
                scores[num]  += cfg.learningRate * (actual - predicted);
            });
        });
    }

    var mlMap = {};
    validPool.forEach(function(num) { mlMap[num] = sigmoid(scores[num]); });

    // ── 통계 블렌딩 (v2.1.0) ──
    var probMap = {};
    if (stat && cfg.history && cfg.history.length > 0) {
        var statMap = buildWeightedProb(cfg, validPool, stat);
        var sw      = Math.min(Math.max(cfg.statWeight || 0.35, 0), 1);
        validPool.forEach(function(num) {
            probMap[num] = mlMap[num] * (1 - sw) + (statMap[num] || 0) * sw;
        });
    } else {
        validPool.forEach(function(num) { probMap[num] = mlMap[num]; });
    }

    // ── Firebase 외부 확률 블렌딩 ──
    if (cfg.externalProbMap) {
        validPool.forEach(function(num) {
            if (cfg.externalProbMap[num] !== undefined) {
                var blended = cfg.externalProbMap[num] * cfg.persistenceWeight
                            + probMap[num] * (1 - cfg.persistenceWeight);
                probMap[num] = Math.min(Math.max(blended, 0.01), 0.95);
            }
        });
    }

    // ── 정규화 ──
    var avg = 0;
    validPool.forEach(function(num) { avg += probMap[num]; });
    avg /= n;
    var scale = (cfg.pick / n) / avg;
    validPool.forEach(function(num) { probMap[num] = Math.min(probMap[num] * scale, 1); });

    return probMap;
}

/* ─────────────────────────────────────────
   큐브 진화 (단일 번호)
───────────────────────────────────────── */
async function evolveHybridCube(itemNum, initialProb, cfg) {
    // 라운드별 랜덤 가중치 (0.95~1.05)
    var randomBoost = 0.95 + Math.random() * 0.10;
    var adaptiveProb  = initialProb * randomBoost;
    var score = 0, success = 0, total = 0;
    var start = performance.now();
    var improvementRate = 0;

    while (performance.now() - start < cfg.evolveTime || total < cfg.loopMin) {
        total++;
        if (Math.random() < adaptiveProb) { success++; score++; }

        if (total % 100 === 0) {
            var currentRate = success / total;
            var delta       = adaptiveProb - currentRate;
            improvementRate = delta > 0 ? 0.15 : 0.08;
            adaptiveProb   += delta * improvementRate;
            adaptiveProb    = Math.min(Math.max(adaptiveProb, 0.01), 0.95);
        }
    }
    return { item: itemNum, score: score, finalProb: adaptiveProb, improvement: improvementRate };
}

/* ─────────────────────────────────────────
   v2.1.0 ③ 유사도 체크 (O(1) historySet)
   isTooSimilar → historySet.has(key) 대체
───────────────────────────────────────── */
function buildHistorySet(history) {
    return new Set(
        (history || []).map(function(h) {
            return JSON.stringify(h.slice().sort(function(a,b){return a-b;}));
        })
    );
}

function getColorZone(n){return n<=10?0:n<=20?1:n<=30?2:n<=40?3:4;}

function scoreCombo(combo, probMap, cfg) {
    var score = 0;
    combo.forEach(function(item) { score += (probMap[item] || 0) * 100; });
    var mean     = combo.reduce(function(a, b) { return a + b; }, 0) / combo.length;
    var variance = combo.reduce(function(s, x) { return s + Math.pow(x - mean, 2); }, 0) / combo.length;
    score += Math.sqrt(variance) * 0.5;
    // 색상 구역 균형 점수 (v2.2.0)
    var czw = (cfg&&cfg.colorZoneWeight!==undefined)?cfg.colorZoneWeight:0.20;
    if(czw>0){
        var zoneCnt=[0,0,0,0,0];
        combo.forEach(function(n){zoneCnt[getColorZone(n)]++;});
        var usedZones=zoneCnt.filter(function(c){return c>0;}).length;
        var maxInZone=Math.max.apply(null,zoneCnt);
        var zs=usedZones>=3&&maxInZone<=3?10:usedZones===2?3:usedZones===1?-5:7;
        score+=zs*czw*5;
    }
    return score;
}

/* ─────────────────────────────────────────
   메인 generate()
───────────────────────────────────────── */
async function generate(options) {
    var cfg = {};
    Object.keys(DEFAULTS).forEach(function(k) { cfg[k] = DEFAULTS[k]; });
    if (options) Object.keys(options).forEach(function(k) { cfg[k] = options[k]; });

    var startTime = performance.now();
    var validPool = buildValidPool(cfg);

    if (validPool.length < cfg.pick) {
        throw new Error('유효한 번호가 부족합니다. (필요:' + cfg.pick + ', 가능:' + validPool.length + ')');
    }

    var pool = [];

    function reportProgress(pct, stats) {
        if (typeof cfg.onProgress === 'function') cfg.onProgress(Math.round(pct), stats || {});
    }

    // ── v2.1.0: StatCache 사전 계산 ──
    reportProgress(0, { phase: 'stat', message: '통계 캐시 계산 중...' });
    var stat = buildStatCache(cfg.history, cfg);

    // ── ML + 통계 블렌딩 확률 모델 ──
    reportProgress(1, { phase: 'ml', message: 'ML 확률 모델 계산 중...' });
    var probMap = buildMLProbabilities(cfg, validPool, stat);
    reportProgress(3, { phase: 'ml_done', message: 'ML 모델 완료', statCache: stat });

    // ── v2.1.0: historySet 구성 (O(1) 중복 체크용) ──
    var historySet = buildHistorySet(cfg.history);

    // ── 이전 풀 로드 ──
    if (cfg.initialPool && Array.isArray(cfg.initialPool)) {
        cfg.initialPool.forEach(function(items) {
            var arr = items.slice().sort(function(a, b) { return a - b; });
            if (arr.every(function(n) { return validPool.indexOf(n) >= 0; })) {
                pool.push({ items: arr, score: scoreCombo(arr, probMap, cfg) });
            }
        });
    }

    reportProgress(5, {
        phase: 'evolving', message: '진화 시작...',
        round: 0, totalRounds: cfg.rounds,
        poolSize: pool.length, bestScore: 0,
        stat: stat
    });

    var prevBestScore  = 0;
    var noImproveCount = 0;
    var scoreHistory   = []; // v2.1.0: 라운드별 점수 추적 (모니터링용)

    for (var round = 0; round < cfg.rounds; round++) {
        await new Promise(function(r) { setTimeout(r, 0); });

        // v2.2.1: 라운드별 동적 probMap 갱신 제거 (번호 쏠림 원인)
        var cubeResults = await Promise.all(
            validPool.map(function(num) { return evolveHybridCube(num, probMap[num], cfg); })
        );
        cubeResults.sort(function(a, b) { return b.score - a.score; });
        var topItems = cubeResults.map(function(r) { return r.item; });

        var candidates = [];
        for (var ci = 0; ci < cfg.poolSize; ci++) {
            var combo    = new Set();
            var mustCount = Math.min(2 + Math.floor(Math.random() * 2), cfg.pick);

            for (var m = 0; m < mustCount && combo.size < cfg.pick; m++) {
                combo.add(topItems[Math.floor(Math.random() * Math.min(cfg.topCandidatePool, topItems.length))]);
            }

            var att = 0;
            while (combo.size < cfg.pick && att++ < 300) {
                var num = validPool[Math.floor(Math.random() * validPool.length)];
                if (Math.random() < probMap[num] * 3) combo.add(num);
            }
            while (combo.size < cfg.pick) {
                combo.add(validPool[Math.floor(Math.random() * validPool.length)]);
            }

            var arr = Array.from(combo).sort(function(a, b) { return a - b; });
            // v2.1.0: O(1) historySet 체크 (기존 isTooSimilar O(N) 대체)
            if (!historySet.has(JSON.stringify(arr))) {
                candidates.push({ items: arr, score: scoreCombo(arr, probMap, cfg) });
            }
        }

        candidates.sort(function(a, b) { return b.score - a.score; });
        candidates.slice(0, 10).forEach(function(c) { pool.push(c); });

        pool.sort(function(a, b) { return b.score - a.score; });
        if (pool.length > 500) pool = pool.slice(0, 500);

        var currentBestScore = pool.length > 0 ? pool[0].score : 0;
        scoreHistory.push(currentBestScore); // 모니터링용

        if (currentBestScore > prevBestScore) {
            noImproveCount = 0;
            prevBestScore  = currentBestScore;
        } else {
            noImproveCount++;
        }

        reportProgress(5 + ((round + 1) / cfg.rounds) * 95, {
            phase        : 'evolving',
            round        : round + 1,
            totalRounds  : cfg.rounds,
            poolSize     : pool.length,
            bestScore    : currentBestScore,
            scoreHistory : scoreHistory.slice(),
            improvement  : noImproveCount === 0 ? '📈 향상' : '→ 유지',
            noImprove    : noImproveCount,
            elapsed      : Math.round(performance.now() - startTime),
            probMap      : probMap,
            topItems     : topItems.slice(0, 10),
            cubeResults  : cubeResults.slice(0, 10).map(function(r) {
                return { item: r.item, score: r.score, finalProb: r.finalProb };
            })
        });

        if (typeof cfg.onRound === 'function') cfg.onRound(round + 1, currentBestScore, scoreHistory);
    }

    reportProgress(100, { phase: 'done', message: '완료!' });

    var topResults       = [];
    var dedupeThreshold  = Math.max(3, cfg.pick - 1);
    for (var ri = 0; ri < pool.length && topResults.length < cfg.topN; ri++) {
        var candidate = pool[ri];
        
        // 기당첨 데이터와 완전 일치(6개) 체크
        var isExactMatch = historySet.has(JSON.stringify(candidate.items));
        if (isExactMatch) continue;
        
        var isDup = topResults.some(function(tr) {
            return candidate.items.filter(function(n) { return tr.items.indexOf(n) >= 0; }).length >= dedupeThreshold;
        });
        if (!isDup) topResults.push(candidate);
    }

    var result = {
        results     : topResults.map(function(r) { return r.items; }),
        scores      : topResults.map(function(r) { return Math.round(r.score * 100) / 100; }),
        probMap     : probMap,
        fullPool    : pool.map(function(p) { return p.items; }),
        scoreHistory: scoreHistory,
        stat        : stat,
        meta: {
            items        : cfg.items,
            pick         : cfg.pick,
            rounds       : cfg.rounds,
            validPoolSize: validPool.length,
            excludedCount: cfg.excludeNumbers ? cfg.excludeNumbers.length : 0,
            rangeStart   : cfg.rangeStart || 1,
            rangeEnd     : cfg.rangeEnd   || cfg.items,
            elapsed      : Math.round(performance.now() - startTime),
            historySize  : cfg.history ? cfg.history.length : 0,
            generatedAt  : new Date().toISOString(),
            version  : '2.2.2'
        }
    };

    if (typeof cfg.onComplete === 'function') cfg.onComplete(result);
    return result;
}

/* ─────────────────────────────────────────
   CubeEngine 객체
───────────────────────────────────────── */
var CubeEngine = {
    generate        : generate,
    buildStatCache  : buildStatCache,
    buildWeightedProb: buildWeightedProb,
    defaults        : DEFAULTS,
    version  : '2.2.2',

    presets: {
        lotto645    : { items: 45, pick: 6,  threshold: 5,  evolveTime: 80,  rounds: 50, poolSize: 2500 },
        lotto638    : { items: 38, pick: 6,  threshold: 5,  evolveTime: 80,  rounds: 50, poolSize: 2500 },
        powerball   : { items: 69, pick: 5,  threshold: 4,  evolveTime: 100, rounds: 60, poolSize: 3000 },
        megamillions: { items: 70, pick: 5,  threshold: 4,  evolveTime: 100, rounds: 60, poolSize: 3000 },
        euromillions: { items: 50, pick: 5,  threshold: 4,  evolveTime: 90,  rounds: 55, poolSize: 2800 },
        keno        : { items: 80, pick: 20, threshold: 15, evolveTime: 150, rounds: 40, poolSize: 3500 },
        fast        : { items: 45, pick: 6,  evolveTime: 80,  rounds: 30, poolSize: 1500 },
        turbo       : { items: 45, pick: 6,  evolveTime: 40,  rounds: 15, poolSize: 800  },
        custom      : {}
    },

    withPreset: function(presetName, additionalOptions) {
        var preset = this.presets[presetName] || {};
        if (!this.presets[presetName]) console.warn('Unknown preset: ' + presetName);
        var merged = {};
        Object.keys(preset).forEach(function(k) { merged[k] = preset[k]; });
        if (additionalOptions) Object.keys(additionalOptions).forEach(function(k) { merged[k] = additionalOptions[k]; });
        return merged;
    }
};

// Node.js
if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = CubeEngine;
}
// 브라우저
if (typeof window !== 'undefined') {
    window.CubeEngine = CubeEngine;
}
