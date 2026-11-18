// 공용 제도 상수(rules.js)를 브라우저처럼 전역 TTOKJAE_RULES로 둔다. 버전은 페이지의 <script src>에서 읽음.
(function loadRules() {
  const fs = require('fs'), path = require('path');
  const html = ['template.html', '../src/template.html', '../index.html', 'index.html'].map(f => path.join(__dirname, f)).find(f => fs.existsSync(f) && /rules\/v[\d.]+\/rules\.js/.test(fs.readFileSync(f, 'utf8')));
  const rel = fs.readFileSync(html, 'utf8').match(/rules\/v[\d.]+\/rules\.js/)[0];
  let src = null;
  for (let d = __dirname, i = 0; i < 6 && src === null; i++, d = path.dirname(d)) {
    const f = path.join(d, 'ttokjaetv.github.io', rel);
    if (fs.existsSync(f)) src = fs.readFileSync(f, 'utf8');
  }
  if (src === null) src = require('child_process').execFileSync(process.execPath, ['-e',
    `fetch('https://ttokjaetv.github.io/${rel}').then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(t => process.stdout.write(t))`]).toString();
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  global.TTOKJAE_RULES = m.exports;
})();
// 공단 '노령연금 예상월액표'(2026년 7월 상·하한액 반영, nps_table.json)와 엔진 결과를 전부 대조
// 실행: node src/test.js
const E = require('./engine.js');
const T = require('./nps_table.json');
let n = 0, bad = 0;
for (const row of T) {
  const B = row[0];
  [10, 15, 20, 25, 30, 35, 40].forEach((y, i) => {
    const r = E.npsCalc({ birth: 1990, startYear: 2026, endYear: 2026 + y - 1, gapMonths: 0, B });
    const got = r.options[5].monthly, want = row[i + 1];
    n++;
    if (got !== want) { bad++; if (bad < 10) console.log('MISMATCH B', B, y + '년', 'got', got, 'want', want); }
  });
}
console.log(`공단 예상월액표 대조: ${n}칸 중 불일치 ${bad}칸`);

const ok = (c, m) => { if (!c) { console.log('FAIL', m); bad++; } };
const a = E.npsAlpha;
ok(a(1988) === 2.4 && a(1998) === 2.4 && a(1999) === 1.8 && a(2007) === 1.8 && a(2008) === 1.5 && a(2009) === 1.485 && a(2025) === 1.245 && a(2026) === 1.29, '비례상수 경계');
ok(E.npsStartAge(1952) === 60 && E.npsStartAge(1953) === 61 && E.npsStartAge(1960) === 62 && E.npsStartAge(1964) === 63 && E.npsStartAge(1968) === 64 && E.npsStartAge(1969) === 65, '수급개시연령');
ok(E.npsTimingRate(-5) === 0.7 && Math.abs(E.npsTimingRate(5) - 1.36) < 1e-12, '조기·연기 조정률');

const r = E.npsCalc({ birth: 1972, startYear: 1998, endYear: 2031, B: 3000000 });
console.log('예시 1972년생 1998~2031 B 300만:', r.normal, '원 / 비례상수', r.alphaEff.toFixed(4),
  '/ 손익분기 조기5', E.npsBreakEven(r, -5).toFixed(2), '연기5', E.npsBreakEven(r, 5).toFixed(2));
ok(Math.abs(E.npsBreakEven(r, -5) - (65 + 0.7 / 0.06)) < 0.05, '조기 5년 손익분기');
ok(Math.abs(E.npsBreakEven(r, 5) - (65 + 1.36 / 0.072)) < 0.05, '연기 5년 손익분기');

const s = E.npsCalc({ birth: 1980, startYear: 2020, endYear: 2028, B: 3000000 });
ok(s.short && s.need === 12, '10년 미만');

// 추납: 0개월이면 결과 그대로, 보험료 = 기준소득월액 × 9.5% × 개월, 임의가입자는 A값 상한
const base = { birth: 1972, startYear: 1998, endYear: 2031, gapMonths: 36, B: 3000000 };
ok(E.npsCalc(Object.assign({}, base, { extraMonths: 0 })).normal === E.npsCalc(base).normal, '추납 0개월');
const c = E.npsChunap(base, { months: 36, B: 3000000 });
ok(c.premium === 285000 && c.cost === 285000 * 36 && c.delta > 0, '추납 보험료');
ok(E.npsChunap(base, { months: 12, B: 5000000, voluntary: true }).xB === 3193511, '임의가입자 A값 상한');
ok(E.npsChunap({ birth: 1980, startYear: 2010, endYear: 2019, gapMonths: 24, B: 2500000 }, { months: 24, B: 410000 }).becameEligible, '추납으로 10년 충족');
// 추납은 안 낸 기간 안에서만: min(추납 개월, 안 낸 기간, 119)
const c0 = E.npsChunap(Object.assign({}, base, { gapMonths: 0 }), { months: 36, B: 3000000 });
ok(c0.months === 0 && c0.limit === 0 && c0.capped && c0.cost === 0 && c0.delta === 0, '안 낸 기간 0개월이면 추납 0개월');
const c1 = E.npsChunap({ birth: 1980, startYear: 2017, endYear: 2026, gapMonths: 1, B: 2500000 }, { months: 12, B: 410000 });
ok(c1.months === 1 && c1.capped && c1.after.P === 120 && c1.becameEligible, '안 낸 1개월 → 추납 1개월');
ok(E.npsChunap(Object.assign({}, base, { gapMonths: 200 }), { months: 150, B: 3000000 }).months === 119, '추납 최대 119개월');
ok(E.npsCalc(Object.assign({}, base, { gapMonths: 12, extraMonths: 36 })).P === 408, '추납 후 가입월수 ≤ 전체 기간');
ok(Math.abs(E.npsSolveB(base, E.npsCalc(base).normal) - 3000000) < 100, 'B값 역산');
console.log('추납 예시(36개월·월 300만):', c.cost, '원 →', '월', c.delta, '원 증가 · 회수', (c.paybackMonths / 12).toFixed(1), '년');

// 연금액 최고한도(법 제53조): 조기·연기 조정 → 부양가족연금 더함 → 마지막에 상한(B값)
ok(E.npsPayable(700000, 59610, 0.7, 410000).monthly === 410000, '조기 70% 후 상한 (기본 70만·부양가족 59,610·상한 41만)');
const cap4 = E.npsCalc({ birth: 1965, startYear: 1988, endYear: 2024, B: 300000, spouse: true, dependents: 2 });
ok(cap4.cap === 410000 && cap4.options.every(o => o.monthly <= 410000) && cap4.options[10].monthly === 410000 && cap4.options[0].monthly === 410000, '상한은 조정 후 총액에 (연기 5년도 B값 이하)');
ok(E.npsBreakEven(cap4, 5) === null, '상한에 걸려 월액 같으면 손익분기 없음');
// 추납 보험료율 = 납부기한(신청 다음 달 말일) 달의 요율, 12월 신청은 다음 해 (같은 달 납부 특례는 그 해)
ok(E.npsPremiumRate(2025) === 0.09 && E.npsPremiumRate(2026) === 0.095 && E.npsPremiumRate(2027) === 0.1 && E.npsPremiumRate(2032) === 0.125 && E.npsPremiumRate(2033) === 0.13, '연도별 보험료율');
ok(E.npsChunapRate(2026, 10) === 0.095 && E.npsChunapRate(2026, 12) === 0.1 && E.npsChunapRate(2026, 12, true) === 0.095 && E.npsChunapRate(2032, 12) === 0.13, '추납 납부기한 달 요율');
ok(E.npsChunap(base, { months: 36, B: 3000000, appYear: 2026, appMonth: 12 }).premium === 300000, '12월 신청 추납 = 다음 해 10%');

// 1998년 이전 가입분은 2.4 × (A + 0.75B) (국민연금법 부칙 1998.12.31.), 1999년부터 α × (A + B)
//  손계산: 1990~1998 9년(2.4, B×0.75) + 1999~2007 9년(1.8) + 2008 1.5 + 2009~2025 17년(1.485 → 1.245)
{
  const A = 3193511, B = 3000000, al = y => y <= 1998 ? 2.4 : y <= 2007 ? 1.8 : y === 2008 ? 1.5 : 1.5 - 0.015 * (y - 2008);
  let sum = 0;
  for (let y = 1990; y <= 2025; y++) sum += al(y) * (A + (y <= 1998 ? 0.75 : 1) * B) * 12;
  const want = sum / 240 / 12, got = E.npsCalc({ birth: 1965, startYear: 1990, endYear: 2025, B }).base;
  ok(Math.abs(got - want) < 1, '1998년 이전 가입분 B×0.75 (기본연금액 ' + Math.round(got) + ' ≈ ' + Math.round(want) + ')');
  const r2 = E.npsCalc({ birth: 1965, startYear: 1990, endYear: 2025, B });
  ok(Math.abs(E.npsSolveB({ birth: 1965, startYear: 1990, endYear: 2025 }, r2.normal) - B) < 100, 'B값 역산 (1998년 이전 가입분 포함)');
}
// 40년 기준 소득대체율 표시: 2.4(1998년 이전) 70% · 1.8 60% · 1.5 50% · 1.29 43%
ok(E.npsReplacement(2.4, 2.4 * 0.75) === 70 && E.npsReplacement(1.8) === 60 && E.npsReplacement(1.5) === 50 && E.npsReplacement(1.29) === 43, '소득대체율 표시 70/60/50/43%');
{
  const g = E.npsCalc({ birth: 1965, startYear: 1990, endYear: 2026, B: 3000000 }).groups.map(x => x.replacement);
  ok(g[0] === 70 && g[1] === 60 && g[2] === 50 && g[g.length - 1] === 43, '가입 기간별 소득대체율 ' + g.join('/'));
}

// 소득대체율 표시 반올림: 가중평균 α의 부동소수 끝수로 x.x5%가 내림되지 않게 (1980년생 2017~2026: ᾱ = 13.035/10 = 1.3035 → 2 × 1.3035 ÷ 6 = 43.45% → 43.5%)
ok(E.npsReplacement(1.3035) === 43.5 && E.npsCalc({ birth: 1980, startYear: 2017, endYear: 2026, B: 2500000 }).repEff === 43.5, '소득대체율 43.45% → 43.5% (반올림)');
// 누적 수령액 = 받기 시작한 해부터 그 나이 해까지 포함 (retire-check·retire-drawdown·freedom과 같은 기준)
//  손계산: 1969년생 1995~2029 B 300만, 정상 65세 월 1,406,500원 → 80세 해까지 16년 = 1,406,500 × 12 × 16 = 270,048,000
//          90세 해까지 26년 = 438,828,000, 시작 해(65세)만 = 16,878,000, 64세 = 0
{
  const q = E.npsCalc({ birth: 1969, startYear: 1995, endYear: 2029, B: 3000000 });
  ok(q.normal === 1406500 && E.npsCumulative(q, 0, 80) === 270048000 && E.npsCumulative(q, 0, 90) === 438828000
    && E.npsCumulative(q, 0, 65) === 16878000 && E.npsCumulative(q, 0, 64) === 0, '누적 수령액 그 나이 해 포함');
  // 손익분기는 연속 시점이라 그대로 (65 + 0.7/0.06), 해 단위 누적으로는 76세 해부터 정상이 많아짐
  ok(E.npsCumulative(q, -5, 75) > E.npsCumulative(q, 0, 75) && E.npsCumulative(q, -5, 76) < E.npsCumulative(q, 0, 76)
    && Math.floor(E.npsBreakEven(q, -5)) === 76, '손익분기 나이가 속한 해에서 누적 순서가 바뀜');
}

// ===== 추납 3자 비교 (글 「추납 포기 vs 최저추납+조기수령 vs 추납+정상수령」 사례 재현) =====
//  사례: 월 100만 → 추납 후 120만(+20만), 추납액 1,100만, 정상 65세. 월 0.5% 감액
//  최소 조기 개월: 120 × (1 − 0.005m) ≥ 100 → m ≤ 33.33. 내림해서 33개월(120×(1−0.165) = 100.2만). 34개월은 99.6만이라 추납 전보다 낮다
{
  const fl = x => Math.floor(x / 10) * 10, M0 = 1000000, M1 = 1200000, K = 11000000, S = 65;
  const payAt = m => fl(M1 * (1 - 0.005 * m));
  const t = E.npsCompare3({ S, M0, M1, cost: K, payAt });
  ok(t.ok && t.m === 33, '조기 개월 내림 33개월 (' + t.m + ')');
  ok(payAt(33) === 1002000 && payAt(34) === 996000 && t.mB === 1002000, '33개월 100.2만, 34개월 99.6만(<100만)');
  ok(Math.abs(t.mExact - 100 / 3) < 1e-9, '정확한 최소 조기 개월 33.33 (' + t.mExact + ')');
  ok(Math.abs(t.B.s - 62.25) < 1e-9, 'B 시작 나이 62.25세');
  ok(t.offsetMonths === 55 && Math.abs(t.paybackYears - 55 / 12) < 1e-9 && Math.abs(t.paybackAge - (65 + 55 / 12)) < 1e-9, '상계월수 55개월 · 4.58년 · 69.58세');
  ok(t.leadAB === 33 * 1002000 - K && t.leadAB === 22066000, 'A↔B 65세 순이익 2,206.6만(엔진: 월 100.2만 × 33개월 − 1,100만)');
  ok(Math.abs(t.xAB - (62.25 + K / (12 * 1002000))) < 1e-9 && Math.abs(t.xAB - 63.164) < 1e-3, 'A↔B 손익분기 ≈ 63.16세');
  ok(Math.abs(t.xBC - (65 + 33 * 1002000 / 198000 / 12)) < 1e-9 && Math.round((t.xBC - 65) * 12) === 167, 'B↔C: 월 100.2만이면 167개월(78.92세)');
  ok(Math.abs(t.xCA - (65 + 55 / 12)) < 1e-9, 'C↔A 손익분기 = 단순 회수 나이');
  ok(E.npsNet(t.A, 70) === 12 * M0 * 5 && E.npsNet(t.C, 65) === -K && E.npsNet(t.B, 62.25) === -K, '순누적: 시작 전 = −비용, 이후 12×월액×경과');
  // 글의 숫자는 B 월액을 100만(감액 무시)으로 본 값: 2,200만원, 165개월(65+13.75 = 78.75세)
  const g = E.npsCompare3({ S, M0, M1, cost: K, payAt: m => m <= 33 ? M0 : 0 });
  ok(g.m === 33 && g.mB === M0 && g.leadAB === 22000000, '글 사례 A↔B 순이익 2,200만원 (B 월 100만 기준)');
  ok(Math.abs(g.xBC - 78.75) < 1e-9 && Math.round((g.xBC - 65) * 12) === 165, '글 사례 B↔C 165개월 → 78.75세 (B 월 100만 기준)');
  // 경계: 증가분 0 이하 → 비교 없음 / 평행·겹침은 교차 없음 / 비용 0이면 상계월수 0
  ok(!E.npsCompare3({ S, M0, M1: M0, cost: K, payAt }).ok, '증가분 0이면 비교하지 않음');
  ok(E.npsCross({ s: 65, M: 1e6, K: 0 }, { s: 65, M: 1e6, K: 0 }) === null && E.npsCross({ s: 65, M: 1e6, K: 0 }, { s: 60, M: 1e6, K: 0 }) === null, '평행·겹치는 선은 교차 없음');
  ok(E.npsCompare3({ S, M0, M1, cost: 0, payAt }).offsetMonths === 0, '추납 비용 0 → 상계월수 0');
  // 60개월(5년) 한도: 증가가 매우 커서 5년 앞당겨도 추납 전 이상이면 60개월에서 멈추고 capped 표시
  const cp = E.npsCompare3({ S, M0, M1: 2000000, cost: K, payAt: m => Math.floor(2000000 * (1 - 0.005 * m) / 10) * 10 });
  ok(cp.m === 60 && cp.capped, '조기 60개월 상한 도달 표시');
}
// 자동 모드: 1972년생 1998~2031, 공백 36개월을 월 300만으로 추납 → npsChunap의 추납 전·후 월액과 같은 값을 쓴다
{
  const o = { birth: 1972, startYear: 1998, endYear: 2031, gapMonths: 36, B: 3000000 };
  const t = E.npsChunap3(o, { months: 36, B: 3000000 });
  const r = E.npsChunap(o, { months: 36, B: 3000000 });
  ok(t.ok && t.M0 === r.before.normal && t.M1 === r.after.normal && t.cost === r.cost && t.S === 65, '자동 모드가 npsChunap 월액·비용 재사용');
  // 연 단위 조기(npsCalc)와 같은 식인지: 12k개월 앞당김 = −k년 옵션
  const a = r.after, pay = m => E.npsPayable(a.base, a.fam, 1 - 0.005 * m, a.cap).monthly;
  for (let k = 1; k <= 5; k++) ok(pay(12 * k) === a.options[5 - k].monthly, '조기 ' + 12 * k + '개월 월액 = 연 단위 −' + k + '년 옵션');
  ok(t.mB >= t.M0 && pay(t.m + 1) < t.M0, '자동 모드 조기 개월: 추납 전 월액 이상 유지되는 한도');
  ok(E.npsChunap3(o, { months: 0, B: 3000000 }).reason === 'noMonths', '추납 0개월이면 비교하지 않음');
  ok(E.npsChunap3({ birth: 1972, startYear: 2015, endYear: 2020, gapMonths: 0, B: 3000000 }, { months: 12 }).reason === 'short', '가입기간 부족이면 비교하지 않음');
}

const f = E.npsBaseMonthly(1.296, 3193511, 3500000, 480);
console.log('firework 대조(비례상수 1.296 가정):', Math.round(f), '원 (firework 표시 1,445,380원)');
process.exit(bad ? 1 : 0);
