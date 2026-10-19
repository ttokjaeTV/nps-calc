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

const f = E.npsBaseMonthly(1.296, 3193511, 3500000, 480);
console.log('firework 대조(비례상수 1.296 가정):', Math.round(f), '원 (firework 표시 1,445,380원)');
process.exit(bad ? 1 : 0);
