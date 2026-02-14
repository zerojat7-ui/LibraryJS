/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║              CubeEngine  v1.3.0                          ║
 * ║   Hybrid Cube Evolution × ML Probability Engine          ║
 * ║   (Persistence & Evolution Continuity Reinforced)        ║
 * ╚══════════════════════════════════════════════════════════╝
 */

(function(global) {
    'use strict';

    var DEFAULTS = {
        items     : 45,
        pick      : 6,
        history   : null,     // 새로운 회차 데이터

        // ── 누적 학습 관련 (v1.3.0 추가) ─────────────────
        externalProbMap : null, // Firebase에서 로드한 확률 맵
        initialPool     : null, // Firebase에서 로드한 이전 세대 상위 조합들
        persistenceWeight: 0.7, // 기존 지식 유지 비율 (0.0~1.0)

        lambda    : 0.18,
        learningRate: 0.05,
        evolveTime : 80,
        loopMin    : 1000,
        rounds     : 50,
        poolSize   : 2500,
        topN      : 5,
        threshold : 5,
        topCandidatePool: 15,

        onProgress: null,
        onRound   : null,
        onComplete: null,
    };

    function baseScore(x) { return Math.sin(x) + Math.cos(x / 2); }
    function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

    // ── 1. ML 확률 모델 (기존 지식과 병합 로직 추가) ──
    function buildMLProbabilities(cfg) {
        var n = cfg.items;
        var scores = [];
        for (var i = 0; i < n; i++) scores.push(baseScore(i + 1));

        if (cfg.history && cfg.history.length > 0) {
            var total = cfg.history.length;
            cfg.history.forEach(function(draw, index) {
                var distance = total - index - 1;
                var weight = Math.exp(-cfg.lambda * distance);
                draw.forEach(function(num) {
                    var idx = num - 1;
                    if (idx >= 0 && idx < n) scores[idx] += weight;
                });
            });

            cfg.history.forEach(function(draw) {
                for (var i = 0; i < n; i++) {
                    var predicted = sigmoid(scores[i]);
                    var actual = draw.indexOf(i + 1) >= 0 ? 1 : 0;
                    scores[i] += cfg.learningRate * (actual - predicted);
                }
            });
        }

        var newProbs = scores.map(sigmoid);

        // 외부 데이터(Firebase)가 있을 경우 블렌딩
        if (cfg.externalProbMap) {
            newProbs = newProbs.map(function(p, i) {
                var savedP = cfg.externalProbMap[i + 1] || p;
                var blended = (savedP * cfg.persistenceWeight) + (p * (1 - cfg.persistenceWeight));
                return Math.min(Math.max(blended, 0.01), 0.95); // Soft Cap
            });
        }

        var avg = newProbs.reduce(function(a, b) { return a + b; }, 0) / n;
        var scale = (cfg.pick / n) / avg;
        return newProbs.map(function(p) { return Math.min(p * scale, 1); });
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
        combo.forEach(function(item) { score += (probMap[item] || 0) * 100; });
        var mean = combo.reduce(function(a, b) { return a + b; }, 0) / combo.length;
        var variance = combo.reduce(function(s, x) { return s + Math.pow(x - mean, 2); }, 0) / combo.length;
        score += Math.sqrt(variance) * 0.5;
        return score;
    }

    // ── 메인 생성 함수 ──
    async function generate(options) {
        var cfg = {};
        Object.keys(DEFAULTS).forEach(function(k) { cfg[k] = DEFAULTS[k]; });
        if (options) Object.keys(options).forEach(function(k) { cfg[k] = options[k]; });

        var startTime = performance.now();
        var pool = [];

        function reportProgress(pct, stats) {
            if (typeof cfg.onProgress === 'function') cfg.onProgress(Math.round(pct), stats || {});
        }

        reportProgress(0, { phase: 'ml', message: 'ML 확률 모델 계산 중...' });
        var mlProbs = buildMLProbabilities(cfg);
        var probMap = {};
        for (var i = 0; i < cfg.items; i++) probMap[i + 1] = mlProbs[i];

        // [v1.3.0] 이전 세대 Pool 주입 (초기 시드 생성)
        if (cfg.initialPool && Array.isArray(cfg.initialPool)) {
            cfg.initialPool.forEach(function(items) {
                var arr = items.slice().sort(function(a, b) { return a - b; });
                pool.push({ items: arr, score: scoreCombo(arr, probMap, cfg) });
            });
        }

        reportProgress(5, { phase: 'evolving', message: '진화 시작...' });

        for (var round = 0; round < cfg.rounds; round++) {
            await new Promise(function(r) { setTimeout(r, 0); });

            var cubeResults = await Promise.all(
                Array.from({ length: cfg.items }, function(_, i) {
                    return evolveHybridCube(i + 1, mlProbs[i], cfg);
                })
            );
            cubeResults.sort(function(a, b) { return b.score - a.score; });
            var topItems = cubeResults.map(function(r) { return r.item; });

            var candidates = [];
            for (var ci = 0; ci < cfg.poolSize; ci++) {
                var combo = new Set();
                var mustCount = Math.min(2 + Math.floor(Math.random() * 2), cfg.pick);
                for (var m = 0; m < mustCount && combo.size < cfg.pick; m++) {
                    combo.add(topItems[Math.floor(Math.random() * cfg.topCandidatePool)]);
                }
                var att = 0;
                while (combo.size < cfg.pick && att++ < 300) {
                    var idx = Math.floor(Math.random() * cfg.items);
                    if (Math.random() < mlProbs[idx] * 3) combo.add(idx + 1);
                }
                while (combo.size < cfg.pick) combo.add(1 + Math.floor(Math.random() * cfg.items));

                var arr = Array.from(combo).sort(function(a, b) { return a - b; });
                if (!isTooSimilar(arr, cfg.history, cfg.threshold)) {
                    candidates.push({ items: arr, score: scoreCombo(arr, probMap, cfg) });
                }
            }

            candidates.sort(function(a, b) { return b.score - a.score; });
            candidates.slice(0, 10).forEach(function(c) { pool.push(c); });

            // 풀 관리: 상위 500개 유지
            pool.sort(function(a, b) { return b.score - a.score; });
            if (pool.length > 500) pool = pool.slice(0, 500);

            reportProgress(5 + ((round + 1) / cfg.rounds) * 95, {
                round: round + 1,
                bestScore: pool.length > 0 ? pool[0].score : 0,
                elapsed: Math.round(performance.now() - startTime)
            });

            if (typeof cfg.onRound === 'function') cfg.onRound(round + 1, pool[0]?.score);
        }

        // 최종 결과 중복 제거
        var topResults = [];
        var dedupeThreshold = Math.max(3, cfg.pick - 1);
        for (var ri = 0; ri < pool.length && topResults.length < cfg.topN; ri++) {
            var candidate = pool[ri];
            var isDup = topResults.some(function(tr) {
                var overlap = candidate.items.filter(function(n) { return tr.items.indexOf(n) >= 0; }).length;
                return overlap >= dedupeThreshold;
            });
            if (!isDup) topResults.push(candidate);
        }

        var result = {
            results : topResults.map(function(r) { return r.items; }),
            scores  : topResults.map(function(r) { return Math.round(r.score * 100) / 100; }),
            probMap : probMap,
            fullPool: pool.map(function(p) { return p.items; }), // Firebase 저장용 전체 풀
            meta: {
                items: cfg.items, pick: cfg.pick, rounds: cfg.rounds,
                elapsed: Math.round(performance.now() - startTime),
                generatedAt: new Date().toISOString()
            }
        };

        if (typeof cfg.onComplete === 'function') cfg.onComplete(result);
        return result;
    }

    var CubeEngine = {
        generate: generate,
        defaults: DEFAULTS,
        presets: {
            lotto645: { items: 45, pick: 6, threshold: 5, evolveTime: 80, rounds: 50, poolSize: 2500 },
            fast: { items: 45, pick: 6, evolveTime: 20, rounds: 5, poolSize: 500 }
        },
        version: '1.3.0'
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = CubeEngine;
    else global.CubeEngine = CubeEngine;

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
