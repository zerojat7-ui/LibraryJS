/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║              CubeEngine  v1.1.1                          ║
 * ║   Hybrid Cube Evolution × ML Probability Engine          ║
 * ║   범용 확률 기반 조합 추천 라이브러리                         ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * 사용법:
 *   <script src="cube-engine.js"></script>
 *   const result = await CubeEngine.generate({ items:45, pick:6 })
 *
 * 또는 ES Module:
 *   import CubeEngine from './cube-engine.js'
 */

(function(global) {
    'use strict';

    // ══════════════════════════════════════════
    //  기본 설정값 (사용자가 모두 덮어쓸 수 있음)
    // ══════════════════════════════════════════
    var DEFAULTS = {
        // ── 필수 ──────────────────────────────
        items     : 45,       // 전체 항목 수 (예: 로또=45, 파워볼=69)
        pick      : 6,        // 뽑을 개수   (예: 로또=6)

        // ── 과거 데이터 (선택) ─────────────────
        history   : null,     // 2D 배열 [[3,14,22,...], ...] | null이면 순수 랜덤 진화

        // ── ML 학습 파라미터 ───────────────────
        lambda    : 0.18,     // 최근 회차 가중치 감쇠율 (클수록 최근 데이터 중시)
        learningRate: 0.05,   // ML 업데이트 강도

        // ── 진화 루프 제어 (핵심: 사용자가 조정) ─
        evolveTime : 80,     // 각 번호 진화 시간 (ms) — 짧을수록 UI 응답성↑, 길수록 정밀
        loopMin    : 1000,   // evolveTime 미달 시 최소 반복 횟수 — 정확도 하한선
        rounds     : 50,      // 전체 진화 라운드 수 — 클수록 다양한 조합 탐색
        poolSize   : 2500,    // 라운드당 조합 생성 수 — 클수록 좋은 조합 발견 가능성↑

        // ── 결과 제어 ──────────────────────────
        topN      : 5,        // 최종 반환 조합 수
        threshold : 5,        // 과거 데이터와 이 개수 이상 겹치면 중복으로 간주 (history 있을 때만)
        topCandidatePool: 15, // 진화 상위 N개 번호를 조합 생성에 우선 활용

        // ── 콜백 ──────────────────────────────
        onProgress: null,     // (percent:0~100, stats:Object) => void
        onRound   : null,     // (roundNum, bestScore) => void  — 라운드 완료마다 호출
        onComplete: null,     // (result:Object) => void        — 최종 완료시 호출
    };

    // ══════════════════════════════════════════
    //  수학 유틸
    // ══════════════════════════════════════════
    function baseScore(x) {
        return Math.sin(x) + Math.cos(x / 2);
    }

    function sigmoid(x) {
        return 1 / (1 + Math.exp(-x));
    }

    function shuffle(arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    // ══════════════════════════════════════════
    //  1. ML 확률 모델
    //     history가 있으면 학습, 없으면 baseScore만 사용
    // ══════════════════════════════════════════
    function buildMLProbabilities(cfg) {
        var n = cfg.items;
        var scores = [];
        for (var i = 0; i < n; i++) scores.push(baseScore(i + 1));

        if (cfg.history && cfg.history.length > 0) {
            var total = cfg.history.length;

            // 최근 데이터 가중치 적용
            cfg.history.forEach(function(draw, index) {
                var distance = total - index - 1;
                var weight = Math.exp(-cfg.lambda * distance);
                draw.forEach(function(num) {
                    var idx = num - 1;
                    if (idx >= 0 && idx < n) scores[idx] += weight;
                });
            });

            // ML gradient 업데이트
            cfg.history.forEach(function(draw) {
                for (var i = 0; i < n; i++) {
                    var predicted = sigmoid(scores[i]);
                    var actual = draw.indexOf(i + 1) >= 0 ? 1 : 0;
                    scores[i] += cfg.learningRate * (actual - predicted);
                }
            });
        }

        var probs = scores.map(sigmoid);
        // pick/items 비율로 스케일 조정
        var avg = probs.reduce(function(a, b) { return a + b; }, 0) / n;
        var scale = (cfg.pick / n) / avg;
        return probs.map(function(p) { return Math.min(p * scale, 1); });
    }

    // ══════════════════════════════════════════
    //  2. 하이브리드 큐브 진화
    //     각 항목(번호)을 독립적으로 진화시켜 점수 부여
    // ══════════════════════════════════════════
    async function evolveHybridCube(itemNum, initialProb, cfg) {
        var adaptiveProb = initialProb;
        var score = 0, success = 0, total = 0;
        var start = performance.now();

        while (
            performance.now() - start < cfg.evolveTime ||
            total < cfg.loopMin
        ) {
            total++;
            if (Math.random() < adaptiveProb) { success++; score++; }

            // 1000번마다 적중률 기반 확률 자동 조정
            if (total % 1000 === 0) {
                var currentRate = success / total;
                var diff = initialProb - currentRate;
                adaptiveProb += diff * 0.1;
                adaptiveProb = Math.min(Math.max(adaptiveProb, 0.01), 0.95);
            }
        }

        return { item: itemNum, score: score, finalProb: adaptiveProb };
    }

    // ══════════════════════════════════════════
    //  3. 중복 검증 (history가 있을 때만)
    // ══════════════════════════════════════════
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

    // ══════════════════════════════════════════
    //  4. 조합 기본 점수 계산
    // ══════════════════════════════════════════
    function scoreCombo(combo, probMap, cfg) {
        var score = 0;
        combo.forEach(function(item) {
            var prob = probMap[item] || 0;
            score += prob * 100;
        });

        // 분산 보너스: 너무 몰리지 않은 조합 우대
        var mean = combo.reduce(function(a, b) { return a + b; }, 0) / combo.length;
        var variance = combo.reduce(function(s, x) { return s + Math.pow(x - mean, 2); }, 0) / combo.length;
        score += Math.sqrt(variance) * 0.5;

        return score;
    }

    // ══════════════════════════════════════════
    //  5. 메인 생성 함수 (async)
    // ══════════════════════════════════════════
    async function generate(options) {
        // 설정 병합
        var cfg = {};
        Object.keys(DEFAULTS).forEach(function(k) { cfg[k] = DEFAULTS[k]; });
        if (options) Object.keys(options).forEach(function(k) { cfg[k] = options[k]; });

        // 유효성 검사
        if (cfg.items < 2)            throw new Error('[CubeEngine] items는 2 이상이어야 합니다.');
        if (cfg.pick < 1)             throw new Error('[CubeEngine] pick은 1 이상이어야 합니다.');
        if (cfg.pick >= cfg.items)    throw new Error('[CubeEngine] pick은 items보다 작아야 합니다.');
        if (cfg.topN < 1)             throw new Error('[CubeEngine] topN은 1 이상이어야 합니다.');

        var startTime = performance.now();
        var pool = [];

        // ── 진행 상황 보고 헬퍼 ──
        function reportProgress(pct, stats) {
            if (typeof cfg.onProgress === 'function') {
                cfg.onProgress(Math.min(Math.round(pct), 100), stats || {});
            }
        }

        reportProgress(0, { phase: 'ml', message: 'ML 확률 모델 계산 중...' });

        // ── Step 1: ML 확률 계산 ──
        var mlProbs = buildMLProbabilities(cfg);

        // probMap 생성 (1-indexed)
        var probMap = {};
        for (var i = 0; i < cfg.items; i++) probMap[i + 1] = mlProbs[i];

        reportProgress(2, { phase: 'ml_done', message: 'ML 완료, 진화 시작...' });

        // ── Step 2: 50 라운드 진화 ──
        for (var round = 0; round < cfg.rounds; round++) {
            // UI 블로킹 방지
            await new Promise(function(r) { setTimeout(r, 0); });

            // 큐브 진화: 모든 항목 동시 진화
            var cubeResults = await Promise.all(
                Array.from({ length: cfg.items }, function(_, i) {
                    return evolveHybridCube(i + 1, mlProbs[i], cfg);
                })
            );
            cubeResults.sort(function(a, b) { return b.score - a.score; });
            var topItems = cubeResults.map(function(r) { return r.item; });

            // poolSize개 조합 생성
            var candidates = [];
            for (var ci = 0; ci < cfg.poolSize; ci++) {
                var combo = new Set();

                // 상위 후보 중 일부 강제 포함
                var mustCount = Math.min(
                    2 + Math.floor(Math.random() * 2),
                    cfg.pick
                );
                for (var m = 0; m < mustCount && combo.size < cfg.pick; m++) {
                    combo.add(topItems[Math.floor(Math.random() * cfg.topCandidatePool)]);
                }

                // 나머지는 ML 확률 기반 샘플링
                var att = 0;
                while (combo.size < cfg.pick && att++ < 300) {
                    var idx = Math.floor(Math.random() * cfg.items);
                    if (Math.random() < mlProbs[idx] * 3) combo.add(idx + 1);
                }

                // 그래도 부족하면 랜덤으로 채움
                while (combo.size < cfg.pick) {
                    combo.add(1 + Math.floor(Math.random() * cfg.items));
                }

                var arr = Array.from(combo).sort(function(a, b) { return a - b; });

                // 중복 검증 (history 있을 때만)
                if (!isTooSimilar(arr, cfg.history, cfg.threshold)) {
                    candidates.push({
                        items : arr,
                        score : scoreCombo(arr, probMap, cfg)
                    });
                }
            }

            // 상위 5개만 풀에 추가
            candidates.sort(function(a, b) { return b.score - a.score; });
            candidates.slice(0, 5).forEach(function(c) { pool.push(c); });

            // 풀 크기 관리 (메모리 절약: 상위 500개만 유지)
            if (pool.length > 500) {
                pool.sort(function(a, b) { return b.score - a.score; });
                pool = pool.slice(0, 500);
            }

            // 풀 정렬 (bestScore 정확하게)
            pool.sort(function(a, b) { return b.score - a.score; });

            var bestNow = pool.length > 0 ? pool[0].score : 0;

            // 라운드 완료 progress 재보고 (UI 즉시 반영)
            reportProgress(2 + ((round + 1) / cfg.rounds) * 95, {
                phase      : 'evolving',
                round      : round + 1,
                totalRounds: cfg.rounds,
                poolSize   : pool.length,
                bestScore  : bestNow,
                elapsed    : Math.round(performance.now() - startTime)
            });

            // 라운드 완료 콜백
            if (typeof cfg.onRound === 'function') {
                cfg.onRound(round + 1, bestNow);
            }

            // UI 반영 기회 보장
            await new Promise(function(r) { setTimeout(r, 0); });
        }

        // ── Step 3: 최종 결과 ──
        pool.sort(function(a, b) { return b.score - a.score; });
        var topResults = pool.slice(0, cfg.topN);

        reportProgress(100, { phase: 'done', message: '완료!' });

        var result = {
            // 추천 조합 배열 (2D)
            results : topResults.map(function(r) { return r.items; }),

            // 각 조합 점수
            scores  : topResults.map(function(r) { return Math.round(r.score * 100) / 100; }),

            // 번호별 ML 확률 맵 {1: 0.18, 2: 0.12, ...}
            probMap : probMap,

            // 메타 정보
            meta: {
                items      : cfg.items,
                pick       : cfg.pick,
                rounds     : cfg.rounds,
                poolSize   : cfg.poolSize,
                historySize: cfg.history ? cfg.history.length : 0,
                elapsed    : Math.round(performance.now() - startTime),
                generatedAt: new Date().toISOString()
            }
        };

        if (typeof cfg.onComplete === 'function') cfg.onComplete(result);
        return result;
    }

    // ══════════════════════════════════════════
    //  공개 API
    // ══════════════════════════════════════════
    var CubeEngine = {
        generate : generate,
        defaults : DEFAULTS,

        /**
         * 설정값 프리셋 모음
         * CubeEngine.presets.lotto645  → 한국 로또 6/45
         * CubeEngine.presets.powerball → 미국 파워볼
         * CubeEngine.presets.fast      → 빠른 테스트용
         * CubeEngine.presets.precise   → 정밀 분석용
         */
        presets: {
            lotto645: {
                items: 45, pick: 6, threshold: 5,
                evolveTime: 80, loopMin: 1000, rounds: 50, poolSize: 2500
            },
            powerball: {
                items: 69, pick: 5, threshold: 4,
                evolveTime: 300, loopMin: 10000, rounds: 50, poolSize: 5000
            },
            bingo: {
                items: 75, pick: 5, threshold: 4,
                evolveTime: 600, loopMin: 20000, rounds: 30, poolSize: 3000
            },
            fast: {
                evolveTime: 200, loopMin: 5000, rounds: 10, poolSize: 500
            },
            precise: {
                evolveTime: 2000, loopMin: 80000, rounds: 100, poolSize: 10000
            }
        },

        /**
         * 프리셋 병합 헬퍼
         * const cfg = CubeEngine.withPreset('lotto645', { history: myData })
         */
        withPreset: function(presetName, overrides) {
            var preset = this.presets[presetName];
            if (!preset) throw new Error('[CubeEngine] 알 수 없는 프리셋: ' + presetName);
            var cfg = {};
            Object.keys(DEFAULTS).forEach(function(k) { cfg[k] = DEFAULTS[k]; });
            Object.keys(preset).forEach(function(k) { cfg[k] = preset[k]; });
            if (overrides) Object.keys(overrides).forEach(function(k) { cfg[k] = overrides[k]; });
            return cfg;
        },

        version: '1.1.2'
    };

    // ── 내보내기 (브라우저 전역 + ES Module 둘 다 지원) ──
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = CubeEngine;             // Node.js / CommonJS
    } else if (typeof define === 'function' && define.amd) {
        define(function() { return CubeEngine; }); // AMD
    } else {
        global.CubeEngine = CubeEngine;           // 브라우저 전역
    }

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
