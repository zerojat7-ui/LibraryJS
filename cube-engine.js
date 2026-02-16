/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║              CubeEngine  v2.4.2  (Universal)             ║
 * ║   Hybrid Cube Evolution × ML Probability Engine          ║
 * ║   + StatCache · WeightedProb · MultiTrend v2.4.2         ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * v2.1.0: StatCache / WeightedProb / historySet O(1) / statWeight
 * v2.2.0: colorZone + bonusHistory 학습 / scoreCombo 색상균형 점수
 * v2.2.1: 라운드별 probMap 동적갱신 제거 (번호 쏠림 버그 수정)
 * v2.2.2: randomBoost(0.95~1.05) 적용 / 기당첨 완전일치 제외
 * v2.2.3: 4중 쏠림 방지 (정규화 강화 / statWeight↓ / 확률 재분배 / 랜덤 강제)
 * v2.2.4: Firebase 블렌딩 구조 수정 (ML 학습 후→전, 누적 고착 해결)
 * v2.2.5: 색상 구역 통계 최근 100회로 제한 (오래된 패턴 배제)
 * v2.3.0: 색상 구역 변화 트렌드 반영 (zoneTrend)
 * v2.4.1: 색상 트렌드 구조 개선
 *         - 최근100회 전반50/후반50 비율 → 최근20회/이전20회 절대변화값(delta)
 *         - zoneDelta = 최근20평균 - 이전20평균 (양수=강세, 음수=약세)
 *         - clamp ±1.2 → 0~1 정규화 (비율 폭발 문제 해결)
 *         ① 홀짝 트렌드  → 홀수 번호 probMap 조정
 *         ② AC값 트렌드  → scoreCombo AC 목표범위 보너스
 *         ③ 연속성 트렌드 → scoreCombo 연속쌍 보너스/감점
 *         ④ 끝수 트렌드  → 끝자리 강세 번호 probMap 조정
 *         ⑤ 번호합 트렌드 → scoreCombo 합계 범위 보너스
 *         ⑥ 고저 트렌드  → 고번호(23~45)/저번호(1~22) probMap 조정
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
    persistenceWeight: 0.3,  // v2.2.4: 0.7 → 0.3 (외부 학습 의존도 감소)

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
    statWeight: 0.15,  // v2.2.3: 0.35 → 0.15 (ML 비중 증가, 과적합 방지)
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
    // v2.4.1: 최근20회/이전20회 절대변화값 구조로 변경
    //   zoneAvg   : 최근 20회 구역별 회차당 평균 출현수 (분포 기준)
    //   zoneDelta : 최근20 평균 - 이전20 평균 (절대 변화값, 양수=강세, 음수=약세)
    var COLOR_ZONES = [
        {name:'yellow',min:1,max:10},{name:'blue',min:11,max:20},
        {name:'red',min:21,max:30},{name:'gray',min:31,max:40},{name:'green',min:41,max:45}
    ];
    var colorZone={}, zoneFreq={}, zoneGap={};
    // zoneTrend: 정규화된 0~1 점수 (0.5=변화없음, >0.5=강세, <0.5=약세)
    var zoneTrend  = {};
    // zoneAvg  : 최근 20회 구역별 평균 출현수 (분포 기준값)
    var zoneAvg    = {};
    // zoneDelta: 절대 변화값 (최근20 - 이전20)
    var zoneDelta  = {};
    COLOR_ZONES.forEach(function(z){
        zoneFreq[z.name]=0; zoneGap[z.name]=total;
        zoneTrend[z.name]=0.5; zoneAvg[z.name]=0; zoneDelta[z.name]=0;
    });
    for(var ci=1;ci<=cfg.items;ci++){
        COLOR_ZONES.forEach(function(z){if(ci>=z.min&&ci<=z.max) colorZone[ci]=z.name;});
    }
    if(history&&history.length>0){
        // zoneFreq / zoneGap: 기존 전체 통계 유지 (다른 로직과 호환)
        var colorWindow  = Math.min(100, history.length);
        var colorHistory = history.slice(-colorWindow);
        colorHistory.forEach(function(draw){
            COLOR_ZONES.forEach(function(z){
                if(draw.some(function(n){return n>=z.min&&n<=z.max;})) zoneFreq[z.name]++;
            });
        });
        for(var zi=colorHistory.length-1;zi>=0;zi--){
            COLOR_ZONES.forEach(function(z){
                if(zoneGap[z.name]===total&&colorHistory[zi].some(function(n){return n>=z.min&&n<=z.max;}))
                    zoneGap[z.name]=colorHistory.length-zi-1;
            });
        }

        // ── v2.4.1: 색상 트렌드 — 최근20회 / 이전20회 절대변화값 ──
        // 최소 40회 필요 (20+20), 부족하면 가진 데이터로 절반씩
        var needMin = 10; // 최소 10회 이상이면 계산
        if(history.length >= needMin) {
            var recentN = Math.min(20, Math.floor(history.length / 2));
            var recentW  = history.slice(-recentN);           // 최근 20회
            var prevW    = history.slice(-(recentN*2), -recentN); // 이전 20회

            COLOR_ZONES.forEach(function(z) {
                // 각 윈도우에서 구역별 회차당 평균 출현수 계산
                var recentSum = 0, prevSum = 0;
                recentW.forEach(function(draw){
                    draw.forEach(function(n){ if(n>=z.min&&n<=z.max) recentSum++; });
                });
                prevW.forEach(function(draw){
                    draw.forEach(function(n){ if(n>=z.min&&n<=z.max) prevSum++; });
                });
                var recentAvg = recentSum / recentW.length;   // 최근 20회 평균
                var prevAvg   = prevSum   / (prevW.length||1);// 이전 20회 평균

                zoneAvg[z.name]   = recentAvg;
                zoneDelta[z.name] = recentAvg - prevAvg;      // 절대 변화값

                // zoneTrend 정규화: delta를 0~1 점수로 변환
                // delta 범위 기준: 로또 6개 중 한 구역 최대 ±1.2 정도가 실제 범위
                // clamp: -1.2 ~ +1.2 → 0.0 ~ 1.0
                var clampMax = 1.2;
                var normalized = (zoneDelta[z.name] + clampMax) / (clampMax * 2);
                zoneTrend[z.name] = Math.min(Math.max(normalized, 0), 1);
            });
        }
    }
    // ── v2.4.2: 5종 트렌드 (최근50회/이전50회 고정 분리, ratio 방식)
    var trendWindow  = Math.min(100, history ? history.length : 0);
    var trendHistory = history ? history.slice(-trendWindow) : [];
    var trends = {
        oddRatio   : 1.0,
        acAvg      : 0,
        acTrend    : 1.0,
        consecAvg  : 0,
        consecTrend: 1.0,
        tailTrend  : {},
        sumAvg     : 0,
        sumTrend   : 1.0,
        highRatio  : 1.0
    };
    for(var td=0; td<=9; td++) trends.tailTrend[td] = 1.0;

    if(trendHistory.length >= 10) {
        // 최근50 / 이전50 고정 분리 (데이터 부족시 절반씩)
        var tHalf   = Math.min(50, Math.floor(trendHistory.length / 2));
        var tSecond = trendHistory.slice(-tHalf);             // 최근 50회
        var tFirst  = trendHistory.slice(-(tHalf * 2), -tHalf); // 이전 50회

        function trendRatio(firstVal, secondVal) {
            if(firstVal === 0) return secondVal > 0 ? 1.5 : 1.0;
            return Math.min(Math.max(secondVal / firstVal, 0.5), 2.0);
        }

        // ① 홀짝 트렌드
        var oddFirst = 0, oddSecond = 0;
        tFirst.forEach(function(d){ d.forEach(function(n){ if(n%2===1) oddFirst++; }); });
        tSecond.forEach(function(d){ d.forEach(function(n){ if(n%2===1) oddSecond++; }); });
        trends.oddRatio = trendRatio(oddFirst/tFirst.length, oddSecond/tSecond.length);

        // ② AC값 트렌드
        function calcAC(draw) {
            var s = draw.slice().sort(function(a,b){return a-b;});
            var diffs = new Set();
            for(var i=0;i<s.length;i++) for(var j=i+1;j<s.length;j++) diffs.add(s[j]-s[i]);
            return diffs.size - (s.length - 1);
        }
        var acFirst = 0, acSecond = 0;
        tFirst.forEach(function(d){ acFirst  += calcAC(d); });
        tSecond.forEach(function(d){ acSecond += calcAC(d); });
        trends.acAvg   = acSecond / tSecond.length;
        trends.acTrend = trendRatio(acFirst/tFirst.length, trends.acAvg);

        // ③ 연속성 트렌드
        function calcConsec(draw) {
            var s = draw.slice().sort(function(a,b){return a-b;}), c=0;
            for(var i=0;i<s.length-1;i++) if(s[i+1]-s[i]===1) c++;
            return c;
        }
        var cFirst = 0, cSecond = 0;
        tFirst.forEach(function(d){ cFirst  += calcConsec(d); });
        tSecond.forEach(function(d){ cSecond += calcConsec(d); });
        trends.consecAvg   = cSecond / tSecond.length;
        trends.consecTrend = trendRatio(cFirst/tFirst.length, trends.consecAvg);

        // ④ 끝수 트렌드
        var tailFirst = {}, tailSecond = {};
        for(var td=0;td<=9;td++){ tailFirst[td]=0; tailSecond[td]=0; }
        tFirst.forEach(function(d){ d.forEach(function(n){ tailFirst[n%10]++; }); });
        tSecond.forEach(function(d){ d.forEach(function(n){ tailSecond[n%10]++; }); });
        for(var td=0;td<=9;td++){
            trends.tailTrend[td] = trendRatio(tailFirst[td]/tFirst.length, tailSecond[td]/tSecond.length);
        }

        // ⑤ 번호합 트렌드
        var sumFirst = 0, sumSecond = 0;
        tFirst.forEach(function(d){ d.forEach(function(n){ sumFirst  += n; }); });
        tSecond.forEach(function(d){ d.forEach(function(n){ sumSecond += n; }); });
        trends.sumAvg   = sumSecond / tSecond.length;
        trends.sumTrend = trendRatio(sumFirst/tFirst.length, trends.sumAvg);

        // ⑥ 고저 트렌드
        var highFirst = 0, highSecond = 0;
        tFirst.forEach(function(d){ d.forEach(function(n){ if(n>=23) highFirst++; }); });
        tSecond.forEach(function(d){ d.forEach(function(n){ if(n>=23) highSecond++; }); });
        trends.highRatio = trendRatio(highFirst/tFirst.length, highSecond/tSecond.length);
    }

    return { freq:freq, recentFreq:recentFreq, gap:gap, reHit:reHit,
             colorZone:colorZone, zoneFreq:zoneFreq, zoneGap:zoneGap,
             COLOR_ZONES:COLOR_ZONES, zoneTrend:zoneTrend,
             zoneAvg:zoneAvg, zoneDelta:zoneDelta, trends:trends };
}

/* ─────────────────────────────────────────
   v2.1.0 ② WeightedProb — 통계 기반 확률
   가중치 구성 (합계 1.00):
   · freqScore   : 전체 빈도       0.18 (←0.22)
   · recentScore : 최근 빈도       0.18 (←0.22)
   · gapScore    : 출현 간격       0.10 (←0.13)
   · reHitScore  : 연속 재출현     0.10 (←0.13)
   · bonusScore  : 보너스 빈도     0.15
   · zgScore     : 구역 간격       0.04 (←0.05)
   · colorTrend  : 색상 트렌드     0.08 (←0.10)
   · oddTrend    : 홀짝 트렌드     0.07 (v2.4.1)
   · tailTrend   : 끝수 트렌드     0.07 (v2.4.1)
   · highTrend   : 고저 트렌드     0.03 (v2.4.1)
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

    // 색상 트렌드 점수 (v2.4.1: zoneTrend 이미 0~1 정규화값)
    var colorTrendScore = {};
    if(stat.zoneTrend&&stat.colorZone){
        validPool.forEach(function(n){
            var z = stat.colorZone[n];
            // zoneTrend[z]: 0~1 (0.5=변화없음, >0.5=강세, <0.5=약세)
            colorTrendScore[n] = (z && stat.zoneTrend[z] !== undefined) ? stat.zoneTrend[z] : 0.5;
        });
    } else { validPool.forEach(function(n){ colorTrendScore[n] = 0.5; }); }

    // ── v2.4.1: 홀짝 트렌드 점수 ──
    // oddRatio > 1.0 → 최근 홀수 강세 → 홀수 번호 점수 상승
    var oddTrendScore = {};
    if(stat.trends){
        var or = stat.trends.oddRatio || 1.0;
        // or 범위 0.5~2.0 → 정규화 0~1
        var orNorm = (or - 0.5) / 1.5;
        validPool.forEach(function(n){
            if(n % 2 === 1) {
                // 홀수: oddRatio 강세면 점수 높게
                oddTrendScore[n] = Math.min(Math.max(orNorm, 0), 1);
            } else {
                // 짝수: oddRatio 약세(짝수 강세)면 점수 높게
                oddTrendScore[n] = Math.min(Math.max(1 - orNorm, 0), 1);
            }
        });
    } else { validPool.forEach(function(n){ oddTrendScore[n] = 0.5; }); }

    // ── v2.4.1: 끝수 트렌드 점수 ──
    // 각 번호의 끝자리(n%10)에 해당하는 tailTrend 비율 → 정규화
    var tailTrendScore = {};
    if(stat.trends && stat.trends.tailTrend){
        var tt = stat.trends.tailTrend;
        validPool.forEach(function(n){
            var ratio = tt[n%10] !== undefined ? tt[n%10] : 1.0;
            tailTrendScore[n] = Math.min(Math.max((ratio - 0.5) / 1.5, 0), 1);
        });
    } else { validPool.forEach(function(n){ tailTrendScore[n] = 0.5; }); }

    // ── v2.4.1: 고저 트렌드 점수 ──
    // highRatio > 1.0 → 고번호 강세 → 23~45 점수 상승
    var highTrendScore = {};
    if(stat.trends){
        var hr = stat.trends.highRatio || 1.0;
        var hrNorm = (hr - 0.5) / 1.5;
        validPool.forEach(function(n){
            if(n >= 23) {
                highTrendScore[n] = Math.min(Math.max(hrNorm, 0), 1);
            } else {
                highTrendScore[n] = Math.min(Math.max(1 - hrNorm, 0), 1);
            }
        });
    } else { validPool.forEach(function(n){ highTrendScore[n] = 0.5; }); }

    validPool.forEach(function(n) {
        var freqScore   = stat.freq[n]       / totalDraw;
        var recentScore = stat.recentFreq[n] / window;
        var gapScore    = Math.min(stat.gap[n] / 20, 1);
        var reHitScore  = stat.reHit[n]      / totalDraw;
        var bonusScore  = bonusTotal > 0 ? bonusFreq[n] / bonusTotal : 0;

        probMap[n] =
            freqScore            * 0.18 +
            recentScore          * 0.18 +
            gapScore             * 0.10 +
            reHitScore           * 0.10 +
            bonusScore           * bw   +
            zoneGapScore[n]      * 0.04 +
            colorTrendScore[n]   * 0.08 +
            oddTrendScore[n]     * 0.07 +
            tailTrendScore[n]    * 0.07 +
            highTrendScore[n]    * 0.03;
        // 합계: 0.18+0.18+0.10+0.10+0.15+0.04+0.08+0.07+0.07+0.03 = 1.00
    });
    return probMap;
}

/* ─────────────────────────────────────────
   ML 기반 확률 모델 (기존 + 통계 블렌딩)
───────────────────────────────────────── */
function buildMLProbabilities(cfg, validPool, stat) {
    var n      = validPool.length;
    var scores = {};

    // ── 초기값: sin/cos 기반 ──
    validPool.forEach(function(num) { scores[num] = baseScore(num); });
    
    // ── v2.2.4: Firebase 외부 학습으로 초기값 조정 (구조 개선) ──
    if (cfg.externalProbMap) {
        validPool.forEach(function(num) {
            if (cfg.externalProbMap[num] !== undefined) {
                // 이전 확률에서 평균을 뺀 "편차"를 scores에 반영
                var prevProb = cfg.externalProbMap[num];
                var avgProb = cfg.pick / validPool.length;  // 기본 기댓값
                var deviation = (prevProb - avgProb) * 5;  // 편차를 scores 스케일로 변환
                scores[num] += deviation * cfg.persistenceWeight;
            }
        });
    }

    // ── ML 학습 (과거 데이터) ──
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
        var sw      = Math.min(Math.max(cfg.statWeight || 0.15, 0), 1);
        validPool.forEach(function(num) {
            probMap[num] = mlMap[num] * (1 - sw) + (statMap[num] || 0) * sw;
        });
    } else {
        validPool.forEach(function(num) { probMap[num] = mlMap[num]; });
    }

    // ── 정규화 + 강제 분산 (v2.2.3 개선) ──
    var avg = 0, min = 1, max = 0;
    validPool.forEach(function(num) { 
        avg += probMap[num];
        min = Math.min(min, probMap[num]);
        max = Math.max(max, probMap[num]);
    });
    avg /= n;
    var scale = (cfg.pick / n) / avg;
    validPool.forEach(function(num) { probMap[num] = Math.min(probMap[num] * scale, 1); });
    
    // 최소값을 평균의 30% 이상으로 보장 (극단적 쏠림 방지)
    validPool.forEach(function(num) {
        if (probMap[num] < avg * 0.3) {
            probMap[num] = avg * 0.3 + Math.random() * avg * 0.2;
        }
    });

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

function scoreCombo(combo, probMap, cfg, stat) {
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

    // 색상 트렌드 보너스 (v2.4.1: zoneDelta 절대변화값 기반)
    // zoneDelta > 0 → 강세 구역 번호 포함 시 보너스
    // zoneDelta < 0 → 약세 구역 번호 포함 시 감점
    if(stat && stat.zoneDelta && stat.colorZone){
        var trendBonus = 0;
        combo.forEach(function(n){
            var z     = stat.colorZone[n];
            var delta = z ? (stat.zoneDelta[z] || 0) : 0;
            // delta 범위 ±1.2 기준, 점수 스케일 조정
            if(delta > 0.2)       trendBonus += delta * 2.5;   // 강세: 최대 +3점
            else if(delta < -0.2) trendBonus += delta * 1.5;   // 약세: 최대 -1.5점
        });
        score += trendBonus * czw;
    }

    // ── v2.4.1: AC값 트렌드 보너스 ──
    // 조합의 AC값이 최근 트렌드 평균(acAvg)에 가까울수록 보너스
    if(stat && stat.trends && stat.trends.acAvg > 0){
        var comboAC = (function(){
            var s = combo.slice().sort(function(a,b){return a-b;});
            var diffs = new Set();
            for(var i=0;i<s.length;i++) for(var j=i+1;j<s.length;j++) diffs.add(s[j]-s[i]);
            return diffs.size - (s.length - 1);
        })();
        var acDiff = Math.abs(comboAC - stat.trends.acAvg);
        // acAvg ±1 이내: +보너스, ±2 이상: -감점
        var acBonus = acDiff <= 1 ? (2 - acDiff) * 1.5 : -(acDiff - 1) * 0.5;
        score += acBonus * czw;
    }

    // ── v2.4.1: 연속성 트렌드 보너스 ──
    // 조합의 연속쌍 수가 최근 트렌드 평균(consecAvg)에 가까울수록 보너스
    if(stat && stat.trends){
        var comboCons = (function(){
            var s = combo.slice().sort(function(a,b){return a-b;}), c=0;
            for(var i=0;i<s.length-1;i++) if(s[i+1]-s[i]===1) c++;
            return c;
        })();
        var cAvg  = stat.trends.consecAvg || 0;
        var cDiff = Math.abs(comboCons - cAvg);
        // consecAvg ±0.5 이내: +보너스
        var cBonus = cDiff <= 0.5 ? 2.0 : cDiff <= 1.0 ? 0.5 : -(cDiff - 1.0) * 0.5;
        score += cBonus * czw;
    }

    // ── v2.4.1: 번호합 트렌드 보너스 ──
    // 조합의 합계가 최근 트렌드 평균(sumAvg)에 가까울수록 보너스
    if(stat && stat.trends && stat.trends.sumAvg > 0){
        var comboSum = combo.reduce(function(a,b){return a+b;}, 0);
        var sAvg     = stat.trends.sumAvg;
        // ±10 이내: 보너스, ±20 초과: 감점
        var sDiff = Math.abs(comboSum - sAvg);
        var sBonus = sDiff <= 10 ? (10 - sDiff) * 0.15
                   : sDiff <= 20 ? 0
                   : -(sDiff - 20) * 0.05;
        score += sBonus * czw;
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
                pool.push({ items: arr, score: scoreCombo(arr, probMap, cfg, stat) });
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

        // v2.2.3: 매 10라운드마다 확률 재분배 (상위 번호 고착 방지)
        if (round % 10 === 0 && round > 0) {
            var used = {};
            pool.slice(0, 50).forEach(function(p) {
                p.items.forEach(function(n) { used[n] = (used[n] || 0) + 1; });
            });
            validPool.forEach(function(n) {
                if (used[n] && used[n] > 5) probMap[n] *= 0.9;  // 많이 쓰인 번호 감소
                if (!used[n]) probMap[n] *= 1.1;  // 안 쓰인 번호 증가
                probMap[n] = Math.min(Math.max(probMap[n], 0.01), 0.95); // 범위 제한
            });
        }

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
            var randomCount = Math.floor(Math.random() * 2); // v2.2.3: 0~1개는 완전 랜덤

            // 상위에서 선택
            for (var m = 0; m < mustCount && combo.size < cfg.pick; m++) {
                combo.add(topItems[Math.floor(Math.random() * Math.min(cfg.topCandidatePool, topItems.length))]);
            }

            // v2.2.3: 완전 랜덤에서 선택 (다양성 확보)
            for (var r = 0; r < randomCount && combo.size < cfg.pick; r++) {
                combo.add(validPool[Math.floor(Math.random() * validPool.length)]);
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
                candidates.push({ items: arr, score: scoreCombo(arr, probMap, cfg, stat) });
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
            version  : '2.4.2'
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
    version  : '2.4.2',

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
