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
ok(E.npsChunap({ birth: 1980, startYear: 2010, endYear: 2018, B: 2500000 }, { months: 24, B: 410000 }).becameEligible, '추납으로 10년 충족');
ok(Math.abs(E.npsSolveB(base, E.npsCalc(base).normal) - 3000000) < 100, 'B값 역산');
console.log('추납 예시(36개월·월 300만):', c.cost, '원 →', '월', c.delta, '원 증가 · 회수', (c.paybackMonths / 12).toFixed(1), '년');

const f = E.npsBaseMonthly(1.296, 3193511, 3500000, 480);
console.log('firework 대조(비례상수 1.296 가정):', Math.round(f), '원 (firework 표시 1,445,380원)');
process.exit(bad ? 1 : 0);
