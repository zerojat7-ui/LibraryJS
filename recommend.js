// ══════════════════════════════════════════
//  recommend.js  — CubeEngine 외부 라이브러리 연동
//  https://zerojat7-ui.github.io/LibraryJS/cube-engine.js
// ══════════════════════════════════════════
var refreshCounter = 0;
var selectedRecs = new Set(); // 선택된 추천 조합 인덱스
var recommendationHistory = [];
var currentRecommendations = [];
var finalTop5 = [];
var loadedRecData = [];
var engineStartTime = 0;
var logCount = 0;

// ────────────────────────────────────
//  기본 점수 계산 (기존 앱 점수 시스템)
// ────────────────────────────────────
function calculateComboScore(combo) {
    var score = 0;
    combo.forEach(function(num) {
        var stat = analysis.numberStats.find(function(s){ return s.number === num; });
        score += stat.count * 1.2 + stat.recentCount * 2;
        var reappear = 0;
        for (var i = 1; i < lottoData.length; i++) {
            if (lottoData[i].numbers.indexOf(num) >= 0 && lottoData[i-1].numbers.indexOf(num) >= 0) reappear++;
        }
        score += reappear * 3;
        var miss = 0;
        for (var i = lottoData.length-1; i >= 0; i--) {
            if (lottoData[i].numbers.indexOf(num) >= 0) break;
            miss++;
        }
        score += (miss < 5 ? 5 : 0);
    });
    score += (countConsecutive(combo) === 1 ? 8 : 0);
    if (Math.abs(calculateAC(combo) - analysis.mostCommonAC) <= 1) score += 10;
    return score;
}

// ────────────────────────────────────
//  기본 추천 생성
// ────────────────────────────────────
function generateRecommendations() {
    refreshCounter++;
    document.getElementById('refreshCount').textContent = refreshCounter;
    var nextRound = lottoData[lottoData.length-1].round + 1;
    document.getElementById('nextRoundLabel').textContent = nextRound;
    addLog('추천 번호 생성 중...');
    var recs = [], attempts = 0;
    while (recs.length < 5 && attempts < 10000) {
        attempts++;
        var combo = new Set();
        var numHot = 2 + Math.floor(Math.random() * 2);
        for (var i = 0; i < numHot && combo.size < 6; i++)
            combo.add(analysis.hotNumbers[Math.floor(Math.random() * Math.min(10, analysis.hotNumbers.length))]);
        while (combo.size < 6) combo.add(1 + Math.floor(Math.random() * 45));
        var sorted = Array.from(combo).sort(function(a,b){return a-b;});
        var key = sorted.join(',');
        if (!analysis.existingCombos.has(key)) {
            var oddCnt = sorted.filter(function(n){return n%2===1;}).length;
            if (oddCnt >= 2 && oddCnt <= 4) {
                recs.push({ id:recs.length+1, numbers:sorted, oddCount:oddCnt, evenCount:6-oddCnt,
                    sum:sorted.reduce(function(a,b){return a+b;},0), consecutive:countConsecutive(sorted), ac:calculateAC(sorted) });
                analysis.existingCombos.add(key);
            }
        }
    }
    addLog(recs.length + '개 조합 생성', 'success');
    displayRecommendations(recs);
    currentRecommendations = recs;
    recommendationHistory.push({ round:nextRound, refresh:refreshCounter, combos:recs });
}

function displayRecommendations(recs) {
    selectedRecs.clear();
    updateRecSaveBtn();
    var c = document.getElementById('recommendations');
    c.innerHTML = '';
    if (!recs.length) { c.innerHTML='<div class="alert alert-warning">추천 번호를 생성할 수 없습니다.</div>'; return; }
    recs.forEach(function(rec, idx) {
        var d = document.createElement('div');
        d.className = 'recommendation';
        d.setAttribute('data-rec-idx', idx);
        d.onclick = function() { toggleRecSelect(idx, d); };
        d.innerHTML = '<div class="rec-header"><div class="rec-title">추천 #'+rec.id+
            ' <span id="rec-check-'+idx+'" style="font-size:14px;display:none;">✅</span></div>'+
            '<div style="font-size:11px;color:#666;">AC:'+rec.ac+' 연속:'+rec.consecutive+'</div></div>'+
            '<div class="rec-numbers">'+rec.numbers.map(function(n){
                return '<div class="lotto-ball '+ballClass(n)+'">'+n+'</div>';
            }).join('')+'</div>'+
            '<div class="rec-info"><div>홀:<strong>'+rec.oddCount+'</strong></div><div>짝:<strong>'+rec.evenCount+'</strong></div><div>합:<strong>'+rec.sum+'</strong></div></div>';
        c.appendChild(d);
    });
}
function toggleRecSelect(idx, el) {
    if (selectedRecs.has(idx)) {
        selectedRecs.delete(idx);
        el.classList.remove('selected');
        var chk = document.getElementById('rec-check-'+idx);
        if (chk) chk.style.display = 'none';
    } else {
        selectedRecs.add(idx);
        el.classList.add('selected');
        var chk = document.getElementById('rec-check-'+idx);
        if (chk) chk.style.display = 'inline';
    }
    updateRecSaveBtn();
}
function updateRecSaveBtn() {
    var btn = document.getElementById('recSaveBtn');
    if (!btn) return;
    btn.disabled = selectedRecs.size === 0;
}
function saveSelectedRecs() {
    var nextRound = lottoData.length > 0 ? lottoData[lottoData.length-1].round + 1 : 1;
    var saved = 0;

    // 기본추천: selectedRecs Set에서 인덱스로 currentRecommendations 읽기
    selectedRecs.forEach(function(idx) {
        var rec = currentRecommendations[idx];
        if (!rec || !rec.numbers || rec.numbers.length !== 6) return;
        saveForecast({ type: 0, round: nextRound, numbers: rec.numbers });
        saved++;
    });

    // 고급추천: advSelectedNums 객체에서 읽기
    Object.keys(advSelectedNums).forEach(function(key) {
        var nums = advSelectedNums[key];
        if (!nums || nums.length !== 6) return;
        saveForecast({ type: 1, round: nextRound, numbers: nums });
        saved++;
    });

    // 초기화
    selectedRecs.clear();
    advSelectedNums = {};
    updateRecSaveBtn();

    // 저장 결과 표시 후 기록탭 이동
    if (saved > 0) {
        alert(saved + '개 저장 완료! 기록탭에서 확인하세요.');
        // 기록탭 클릭
        var tabs = document.querySelectorAll('.tab');
        if (tabs[3]) tabs[3].click();
    } else {
        alert('저장할 항목이 없습니다. 조합을 먼저 선택(탭)해주세요.');
    }
}


function refreshRecommendations() { generateRecommendations(); }

// ────────────────────────────────────
//  모니터 UI 헬퍼
// ────────────────────────────────────
function mLog(msg, color) {
    var el = document.getElementById('monitorLog');
    var d = document.createElement('div');
    d.style.color = color || '#00ff88';
    d.textContent = '['+new Date().toLocaleTimeString('ko-KR')+'] '+msg;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
    logCount++;
    var countEl = document.getElementById('monitorLogCount');
    if (countEl) countEl.textContent = logCount + '개';
}

function setPhase(phase) {
    // phase: 'ml' | 'evo' | 'pool' | 'done'
    var map = { ml:'phaseML', evo:'phaseEVO', pool:'phasePOOL', done:'phaseDONE' };
    var order = ['ml','evo','pool','done'];
    var idx = order.indexOf(phase);
    order.forEach(function(p, i) {
        var el = document.getElementById(map[p]);
        if (!el) return;
        el.className = 'phase-badge ' + (i < idx ? 'phase-done' : i === idx ? 'phase-active' : 'phase-wait');
    });
}

function updateElapsed() {
    var el = document.getElementById('monitorElapsed');
    if (el && engineStartTime) el.textContent = '경과: ' + ((performance.now()-engineStartTime)/1000).toFixed(1) + 's';
}

function mShowCombo(nums) {
    document.getElementById('monitorCurrentCombo').innerHTML = nums.map(function(n){
        return '<div style="width:30px;height:30px;border-radius:50%;background:'+(n%2===0?'#00C49F':'#FF8042')+
               ';display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;">'+n+'</div>';
    }).join('');
}

// ────────────────────────────────────
//  고급 엔진: CubeEngine 외부 라이브러리 사용
// ────────────────────────────────────
// ── Firebase에서 엔진 학습 데이터 로드 ──
async function loadEngineState() {
    try {
        var db = typeof firebase !== 'undefined' && firebase.apps.length > 0
                 ? firebase.firestore() : null;
        if (!db) return null;
        var snap = await db.collection('lotto_history').doc('engine_state').get();
        if (snap.exists) {
            var data = snap.data();
            mLog('🔥 Firebase 학습 데이터 로드 완료 (iteration: ' + (data.iteration || 0) + ')');
            return data;
        }
        return null;
    } catch(e) {
        mLog('⚠️ Firebase 학습 데이터 로드 실패: ' + e.message, '#ff6b6b');
        return null;
    }
}

// ── Firebase에 엔진 학습 결과 저장 ──
async function saveEngineState(result, iteration) {
    try {
        var db = typeof firebase !== 'undefined' && firebase.apps.length > 0
                 ? firebase.firestore() : null;
        if (!db) return false;

        // probMap의 키를 문자열로 변환 (Firestore 요구사항)
        var probMapStr = {};
        Object.keys(result.probMap).forEach(function(k) {
            probMapStr['n' + k] = result.probMap[k];
        });

        // fullPool 상위 100개만 저장
        var poolToSave = result.fullPool.slice(0, 100).map(function(combo) {
            return { items: combo };
        });

        await db.collection('lotto_history').doc('engine_state').set({
            probMap  : probMapStr,
            pool     : poolToSave,
            iteration: iteration,
            savedAt  : firebase.firestore.FieldValue.serverTimestamp(),
            bestScore: result.scores[0] || 0
        });
        return true;
    } catch(e) {
        mLog('⚠️ Firebase 학습 저장 실패: ' + e.message, '#ff6b6b');
        return false;
    }
}

// ── probMap 키 복원 (n1 → 1) ──
function restoreProbMap(probMapStr) {
    if (!probMapStr) return null;
    var probMap = {};
    Object.keys(probMapStr).forEach(function(k) {
        var num = parseInt(k.replace('n', ''));
        if (!isNaN(num)) probMap[num] = probMapStr[k];
    });
    return Object.keys(probMap).length > 0 ? probMap : null;
}

async function runAdvancedEngine() {
    if (typeof CubeEngine === 'undefined') {
        alert('CubeEngine 라이브러리를 불러오는 중입니다. 잠시 후 다시 시도해주세요.\n\n(cube-engine.js 로드 실패 시 네트워크 확인)');
        return;
    }

    var btn = document.getElementById('advancedBtn');
    btn.disabled = true;
    btn.innerHTML = '⏳ 분석 중...';
    finalTop5 = [];
    logCount = 0;
    engineStartTime = performance.now();

    // 모니터 초기화
    var monitor = document.getElementById('advancedMonitor');
    monitor.style.display = 'block';
    document.getElementById('advancedResults').innerHTML = '';
    document.getElementById('monitorLog').innerHTML = '';
    document.getElementById('monitorLogCount').textContent = '0개';
    document.getElementById('monitorRound').textContent = '0';
    document.getElementById('monitorRoundTotal').textContent = '/ 50';
    document.getElementById('monitorCandidates').textContent = '0';
    document.getElementById('monitorBestScore').textContent = '-';
    document.getElementById('monitorBar').style.width = '0%';
    document.getElementById('monitorPercent').textContent = '0%';
    document.getElementById('monitorPhaseText').textContent = '준비 중...';
    document.getElementById('monitorCurrentCombo').innerHTML = '<span style="color:#555;font-size:12px;">대기 중...</span>';
    document.getElementById('monitorETA').textContent = '남은 시간: 계산 중...';
    setPhase('ml');

    var elapsedInterval = setInterval(updateElapsed, 500);
    var historyNums = lottoData.map(function(d){ return d.numbers; });
    var totalRounds = 50;

    mLog('🧠 CubeEngine v' + CubeEngine.version + ' 시작');
    mLog('📊 데이터: ' + historyNums.length + '회차 학습');

    // ── Firebase에서 이전 학습 상태 로드 ──
    setPhase('ml');
    document.getElementById('monitorPhaseText').textContent = '🔥 Firebase 학습 데이터 로딩...';
    var engineState  = await loadEngineState();
    var prevProbMap  = engineState ? restoreProbMap(engineState.probMap) : null;
    var prevPool     = engineState ? (engineState.pool || []).map(function(p){ return p.items; }) : null;
    var prevIter     = engineState ? (engineState.iteration || 0) : 0;

    if (prevProbMap) {
        mLog('✅ 이전 학습 데이터 로드 (iteration: ' + prevIter + ')', '#ffd700');
    } else {
        mLog('🆕 첫 실행: 신규 학습 시작');
    }

    try {
        var result = await CubeEngine.generate(
            CubeEngine.withPreset('lotto645', {
                history        : historyNums,
                externalProbMap: prevProbMap,   // ← 이전 학습 확률맵 주입
                initialPool    : prevPool,       // ← 이전 세대 풀 주입
                topN           : 5,
                rounds         : totalRounds,

                onProgress: function(percent, stats) {
                    document.getElementById('monitorBar').style.width = percent + '%';
                    document.getElementById('monitorPercent').textContent = percent + '%';

                    if (stats.phase === 'ml') {
                        setPhase('ml');
                        document.getElementById('monitorPhaseText').textContent = '① ML 확률 모델 계산 중...';
                        mLog('🧠 ML 모델 학습 시작 (lambda=0.18)');
                    }
                    if (stats.phase === 'ml_done') {
                        setPhase('evo');
                        document.getElementById('monitorPhaseText').textContent = '② 큐브 진화 준비...';
                        mLog('✅ ML 완료 → 큐브 진화 시작');
                    }
                    if (stats.phase === 'evolving') {
                        setPhase('pool');
                        document.getElementById('monitorRound').textContent = stats.round;
                        document.getElementById('monitorRoundTotal').textContent = '/ ' + stats.totalRounds;
                        document.getElementById('monitorCandidates').textContent = stats.poolSize;
                        document.getElementById('monitorPhaseText').textContent =
                            '③ 라운드 ' + stats.round + '/' + stats.totalRounds + ' 완료 — 후보: ' + stats.poolSize + '개';

                        if (stats.bestScore > 0)
                            document.getElementById('monitorBestScore').textContent = stats.bestScore.toFixed(1);

                        if (stats.poolSize > 0) {
                            var pool = result && result.results ? result.results[0] : null;
                            if (!pool) {
                                var sNums = [];
                                var sUsed = new Set();
                                if (analysis && analysis.hotNumbers) {
                                    analysis.hotNumbers.slice(0,3).forEach(function(n){ sNums.push(n); sUsed.add(n); });
                                }
                                while (sNums.length < 6) {
                                    var n = 1 + Math.floor(Math.random() * 45);
                                    if (!sUsed.has(n)) { sUsed.add(n); sNums.push(n); }
                                }
                                mShowCombo(sNums.sort(function(a,b){return a-b;}));
                            }
                        }

                        if (stats.round > 1 && stats.elapsed > 0) {
                            var perRound = stats.elapsed / stats.round;
                            var remaining = Math.round(perRound * (stats.totalRounds - stats.round) / 1000);
                            document.getElementById('monitorETA').textContent =
                                '남은 시간: 약 ' + (remaining > 0 ? remaining + '초' : '거의 완료');
                        }
                    }
                    if (stats.phase === 'done') {
                        setPhase('done');
                        document.getElementById('monitorPhaseText').textContent = '④ 완료!';
                        document.getElementById('monitorETA').textContent = '완료 ✅';
                    }
                },

                onRound: function(roundNum, bestScore) {
                    if (roundNum % 5 === 0) {
                        mLog('✅ ' + roundNum + '/' + totalRounds + ' 라운드 완료 | 최고점: ' + bestScore.toFixed(1));
                    }
                }
            })
        );

        clearInterval(elapsedInterval);
        updateElapsed();

        finalTop5 = result.results.map(function(nums, i) {
            return { numbers: nums, score: result.scores[i] };
        });

        document.getElementById('monitorCurrentCombo').innerHTML =
            '<span style="color:#00ff88;font-size:14px;font-weight:bold;">✅ TOP 5 선정 완료!</span>';

        mLog('🏆 완료! 소요: ' + (result.meta.elapsed/1000).toFixed(1) + 's | 데이터: ' + result.meta.historySize + '회차');
        mLog('📦 최고점: ' + result.scores[0].toFixed(1) + ' | iteration: ' + (prevIter + 1), '#ffd700');

        // ── Firebase에 학습 결과 저장 ──
        var newIter = prevIter + 1;
        saveEngineState(result, newIter).then(function(ok) {
            if (ok) {
                mLog('🔥 Firebase 학습 저장 완료 (iteration: ' + newIter + ')', '#00ff88');
            }
        });

        btn.disabled = false;
        btn.innerHTML = '🔁 다시 분석';
        displayFinalTop5(result);

    } catch(e) {
        clearInterval(elapsedInterval);
        mLog('❌ 오류: ' + e.message, '#ff6b6b');
        document.getElementById('monitorPhaseText').textContent = '오류 발생';
        btn.disabled = false;
        btn.innerHTML = '🔁 다시 시도';
    }
}

function displayFinalTop5(result) {
    var c = document.getElementById('advancedResults');
    var elapsed = result ? (result.meta.elapsed/1000).toFixed(1) : '-';
    c.innerHTML = '<div style="background:#1a1a2e;border-radius:10px;padding:12px;margin-bottom:12px;color:white;">'+
        '<div style="color:#00ff88;font-size:13px;font-weight:bold;margin-bottom:3px;">🧠 CubeEngine ML 결과</div>'+
        '<div style="color:#aaa;font-size:11px;">ML확률모델 × 큐브진화 × 5000개 × 50라운드 | 소요: '+elapsed+'s</div></div>';
    finalTop5.forEach(function(rec, idx) {
        var d = document.createElement('div');
        d.className = 'recommendation';
        var advIdx = 'adv_'+idx;
        d.setAttribute('data-adv-idx', advIdx);
        d.onclick = function() { toggleAdvSelect(advIdx, d, rec.numbers); };
        d.innerHTML = '<div class="rec-header">'+
            '<div class="rec-title">'+(idx===0?'👑 대표':'🎯 #'+(idx+1))+
            ' <span id="rec-check-'+advIdx+'" style="font-size:14px;display:none;">✅</span></div>'+
            '<div style="font-size:11px;color:#666;">SCORE: '+rec.score.toFixed(1)+'</div></div>'+
            '<div class="rec-numbers">'+rec.numbers.map(function(n){
                return '<div class="lotto-ball '+ballClass(n)+'">'+n+'</div>';
            }).join('')+'</div>';
        c.appendChild(d);
    });
}
var advSelectedNums = {};
function toggleAdvSelect(idx, el, nums) {
    if (advSelectedNums[idx]) {
        delete advSelectedNums[idx];
        el.classList.remove('selected');
        var chk = document.getElementById('rec-check-'+idx);
        if (chk) chk.style.display='none';
    } else {
        advSelectedNums[idx] = nums;
        el.classList.add('selected');
        var chk = document.getElementById('rec-check-'+idx);
        if (chk) chk.style.display='inline';
    }
    // 고급결과에도 저장버튼 활성화
    var btn = document.getElementById('recSaveBtn');
    if (btn) btn.disabled = (selectedRecs.size===0 && Object.keys(advSelectedNums).length===0);
}

// ────────────────────────────────────
//  추천번호 불러오기
// ────────────────────────────────────