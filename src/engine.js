// ============== 국민연금 노령연금 계산 엔진 ==============
// 기준: 국민연금공단 '예상연금 간단계산' 유의사항 (2026-10-13 확인)
//   연금액 = Σ(가입연도별 비례상수 × (A + B) × 그해 가입월수 / P) × (1 + 0.05n/12) × 지급률 ÷ 12
//   지급률: 가입 10년 50%, 1개월마다 5/12%씩 증가 → 20년 100%. n = 20년 초과 가입월수.
//   두 식을 합치면 가입기간 요소 = P / 240 (10년 0.5 · 20년 1 · 40년 2) 로 정확히 같아진다.
// 공단 '노령연금 예상월액표'(2026년 7월 상·하한액 반영, 620개 소득 × 7개 기간)와 원 단위까지 대조 (src/test.js)
const NPS = {
  A: 3193511,            // 2026년 적용 A값 (전체 가입자 평균소득월액)
  A_YEAR: 2026,
  B_MIN: 410000,         // 기준소득월액 하한 (2026-07 ~ 2027-06)
  B_MAX: 6590000,        // 기준소득월액 상한 (2026-07 ~ 2027-06)
  SPOUSE: 25550,         // 부양가족연금 배우자 월액 (연 306,630원)
  DEPENDENT: 17030,      // 부양가족연금 자녀·부모 월액 (연 204,360원)
  EARLY_PER_YEAR: 0.06,  // 조기노령연금: 1년 앞당길 때마다 6%(월 0.5%) 감액, 최대 5년
  DELAY_PER_YEAR: 0.072, // 연기연금: 1년 늦출 때마다 7.2%(월 0.6%) 가산, 최대 5년
  MIN_MONTHS: 120,       // 노령연금 최소 가입기간 10년
  MAX_CHUNAP: 119,       // 추납 최대 119개월 (10년 미만, 군복무 포함)
  RATE_2026: 0.095,      // 2026년 연금보험료율 (2033년 13%까지 매년 0.5%p 인상)
  FIRST_YEAR: 1988,      // 국민연금 시행
};

// 가입연도별 비례상수 (소득대체율 ÷ 40년 × 2 와 같은 값)
// 1988~1998 70%(2.4) · 1999~2007 60%(1.8) · 2008 50%(1.5) · 2009~2025 매년 0.015씩 감소(2025 1.245) · 2026~ 43%(1.29)
function npsAlpha(year) {
  if (year <= 1998) return 2.4;
  if (year <= 2007) return 1.8;
  if (year <= 2025) return Math.round((1.5 - 0.015 * (year - 2008)) * 1000) / 1000;
  return 1.29;
}
// 비례상수 → 그 해 가입분의 소득대체율(40년 가입 기준, %)
const npsReplacement = alpha => Math.round(alpha / 2.4 * 70 * 10) / 10;

// 출생연도별 노령연금 수급개시연령
function npsStartAge(birth) {
  if (birth <= 1952) return 60;
  if (birth <= 1956) return 61;
  if (birth <= 1960) return 62;
  if (birth <= 1964) return 63;
  if (birth <= 1968) return 64;
  return 65;
}

// 공단 예상월액표는 10원 미만을 버린다
const floor10 = x => Math.floor(x / 10 + 1e-9) * 10;

// 핵심 계산 (월 기본연금액, 정상 수급 기준)
//  alphaEff: 가입월수로 가중평균한 비례상수, P: 전체 가입월수, B: 원
function npsBaseMonthly(alphaEff, A, B, P) {
  return alphaEff * (A + B) * (P / 240) / 12;
}

// 수급 시기 조정률 (offset: −5 ~ +5년, 음수 = 조기)
function npsTimingRate(offset) {
  if (offset < 0) return 1 - NPS.EARLY_PER_YEAR * Math.min(5, -offset);
  if (offset > 0) return 1 + NPS.DELAY_PER_YEAR * Math.min(5, offset);
  return 1;
}

// o = { birth, startYear, endYear, gapMonths, B(원), spouse(bool), dependents(명), A(선택) }
function npsCalc(o) {
  const A = o.A || NPS.A;
  const res = { ok: false, warnings: [] };
  const birth = Math.round(o.birth), sy = Math.round(o.startYear), ey = Math.round(o.endYear);
  if (!(birth >= 1930 && birth <= 2010)) { res.error = '출생연도를 확인해 주세요 (1930~2010년).'; return res; }
  if (!(sy >= NPS.FIRST_YEAR)) { res.error = '국민연금은 1988년에 시작했습니다. 가입 시작연도를 1988년 이후로 넣어 주세요.'; return res; }
  if (!(ey >= sy)) { res.error = '가입 종료연도가 시작연도보다 빠릅니다.'; return res; }

  // 가입연도별 월수 (각 해 1~12월 전부 가입으로 보고, 안 낸 기간은 전체에서 고르게 뺀다)
  const years = [];
  let sumAlpha = 0;
  for (let y = sy; y <= ey; y++) { const a = npsAlpha(y); years.push({ year: y, alpha: a }); sumAlpha += a * 12; }
  const fullMonths = years.length * 12;
  const gap = Math.max(0, Math.min(fullMonths, Math.round(o.gapMonths || 0)));
  const P0 = fullMonths - gap;
  const alpha0 = sumAlpha / fullMonths;   // 고르게 뺐으므로 가중평균은 그대로
  // 추납(추후납부)으로 더하는 기간: 납부한 해의 비례상수·그때 기준소득월액으로 인정 (2025-11 개편: 납부 시점 기준)
  const xm = Math.max(0, Math.min(NPS.MAX_CHUNAP, Math.round(o.extraMonths || 0)));
  const xAlpha = o.extraAlpha || npsAlpha(NPS.A_YEAR);
  const P = P0 + xm;
  const alphaEff = P > 0 ? (alpha0 * P0 + xAlpha * xm) / P : alpha0;

  // 기간별 묶음 (화면 표시용)
  const groups = [];
  years.forEach(y => {
    const g = groups[groups.length - 1];
    if (g && g.alpha === y.alpha && g.to === y.year - 1) g.to = y.year;
    else groups.push({ from: y.year, to: y.year, alpha: y.alpha });
  });
  groups.forEach(g => { g.months = (g.to - g.from + 1) * 12 * (P0 / fullMonths); g.replacement = npsReplacement(g.alpha); });
  if (xm) groups.push({ from: NPS.A_YEAR, to: NPS.A_YEAR, alpha: xAlpha, months: xm, replacement: npsReplacement(xAlpha), chunap: true });

  // B값 상·하한
  let B0 = Math.round(o.B || 0);
  const Braw = B0;
  if (B0 < NPS.B_MIN) { B0 = NPS.B_MIN; res.warnings.push('bmin'); }
  if (B0 > NPS.B_MAX) { B0 = NPS.B_MAX; res.warnings.push('bmax'); }
  // 추납 기간 소득: 신청월 기준소득월액 (상·하한, 임의가입자는 A값까지)
  let xB = Math.round(o.extraB || B0);
  xB = Math.max(NPS.B_MIN, Math.min(o.voluntary ? A : NPS.B_MAX, xB));
  const B = xm ? Math.round((B0 * P0 + xB * xm) / P) : B0;

  const startAge = npsStartAge(birth);
  if (sy - birth < 18) res.warnings.push('young');
  if (ey - birth >= 60) res.warnings.push('voluntary');   // 60세 이후는 임의계속가입
  if (ey >= birth + startAge) res.warnings.push('pastStart');

  Object.assign(res, { A, B, B0, Braw, P, P0, gap, fullMonths, alphaEff, groups, startAge, birth, startYear: sy, endYear: ey, xm, xB });
  res.repEff = npsReplacement(alphaEff);
  res.yearsText = monthsText(P);

  if (P < NPS.MIN_MONTHS) {
    res.short = true;
    res.ok = true;
    res.need = NPS.MIN_MONTHS - P;
    return res;
  }

  const base = npsBaseMonthly(alphaEff, A, B, P);
  const fam = (o.spouse ? NPS.SPOUSE : 0) + Math.max(0, Math.round(o.dependents || 0)) * NPS.DEPENDENT;
  // 월지급액(부양가족연금 포함)은 B값을 넘을 수 없다 (공단 유의사항 5, 단일 B값으로 근사)
  const capped = Math.min(base + fam, B);
  const capHit = base + fam > B;
  const basePart = Math.max(0, capped - fam);
  const famPart = capped - basePart;

  const options = [];
  for (let k = -5; k <= 5; k++) {
    const rate = npsTimingRate(k);
    const monthly = floor10(basePart * rate) + famPart;
    options.push({ offset: k, age: startAge + k, year: birth + startAge + k, rate, monthly });
  }
  Object.assign(res, { ok: true, base, fam, capped, capHit, basePart, famPart, options,
    normal: options[5].monthly });
  return res;
}

function monthsText(m) {
  m = Math.round(m);
  const y = Math.floor(m / 12), r = m % 12;
  if (y && r) return y + '년 ' + r + '개월';
  if (y) return y + '년';
  return r + '개월';
}

// 손익분기 나이: 조기/연기(offset) 선택과 정상 수급의 누적 수령액(오늘 돈 가치)이 같아지는 나이
//  조기 k년: (1 − 0.06k)(x − S + k) = (x − S)  → x = S + (1 − 0.06k)/0.06
//  연기 k년: (1 + 0.072k)(x − S − k) = (x − S) → x = S + (1 + 0.072k)/0.072
// 부양가족연금은 조정되지 않으므로 실제 월액으로 직접 푼다
function npsBreakEven(res, offset) {
  if (!res.ok || res.short || offset === 0) return null;
  const S = res.startAge, Mn = res.normal, Mo = res.options[offset + 5].monthly;
  const so = S + offset;
  // Mo × (x − so) = Mn × (x − S)  →  x = (Mo·so − Mn·S) / (Mo − Mn)
  if (Mo === Mn) return null;
  return (Mo * so - Mn * S) / (Mo - Mn);
}

// 나이별 누적 수령액 (오늘 돈 가치, 원). 연금은 매년 물가만큼 오르므로 실질 월액은 일정하다고 본다
function npsCumulative(res, offset, age) {
  if (!res.ok || res.short) return 0;
  const o = res.options[offset + 5];
  const yrs = Math.max(0, age - o.age);
  return o.monthly * 12 * yrs;
}

// 추납 손익: o = npsCalc 입력, c = { months, B(신청월 기준소득월액, 원), voluntary(임의가입자), offset(받는 시기), rate(보험료율) }
//  추납보험료 = 신청월 기준소득월액 × 납부기한 달 보험료율 × 개월 (국민연금공단 추납 안내)
//  임의가입자는 월 보험료 상한 = A값 × 보험료율
function npsChunap(o, c) {
  const months = Math.max(0, Math.min(NPS.MAX_CHUNAP, Math.round(c.months || 0)));
  const rate = c.rate || NPS.RATE_2026;
  const A = o.A || NPS.A;
  let xB = Math.max(NPS.B_MIN, Math.min(c.voluntary ? A : NPS.B_MAX, Math.round(c.B || 0)));
  const premium = floor10(xB * rate);               // 월 연금보험료 (10원 미만 버림)
  const cost = premium * months;
  const before = npsCalc(o);
  const after = npsCalc(Object.assign({}, o, { extraMonths: months, extraB: xB, voluntary: c.voluntary }));
  const off = Math.max(-5, Math.min(5, Math.round(c.offset || 0)));
  const mBefore = before.ok && !before.short ? before.options[off + 5].monthly : 0;
  const mAfter = after.ok && !after.short ? after.options[off + 5].monthly : 0;
  const delta = mAfter - mBefore;
  const startAge = after.ok ? after.startAge + off : null;
  const paybackMonths = delta > 0 ? cost / delta : Infinity;
  return {
    ok: before.ok && after.ok, months, xB, premium, cost, rate, before, after, mBefore, mAfter, delta, startAge,
    becameEligible: before.ok && before.short && after.ok && !after.short,
    stillShort: after.ok && after.short,
    paybackMonths, beAge: isFinite(paybackMonths) && startAge !== null ? startAge + paybackMonths / 12 : null,
  };
}

// 공단에서 조회한 예상 월액(정상 수급, 부양가족연금 제외)에 맞는 평균 소득(B값) 역산
function npsSolveB(o, targetMonthly) {
  const r = npsCalc(Object.assign({}, o, { spouse: false, dependents: 0, extraMonths: 0 }));
  if (!r.ok || r.short || !(targetMonthly > 0)) return null;
  const B = targetMonthly * 12 * 240 / (r.alphaEff * r.P) - r.A;
  return Math.round(B);
}

if (typeof module !== 'undefined') module.exports = { NPS, npsAlpha, npsReplacement, npsStartAge, npsCalc, npsChunap, npsSolveB, npsBaseMonthly, npsTimingRate, npsBreakEven, npsCumulative, floor10, monthsText };
