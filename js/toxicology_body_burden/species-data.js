// Physiological reference values for the Toxicology Body Burden tool.
//
// Reference-value fields:
//   bv: circulating blood volume (mL/kg) used in Mode A
//   bv_range: display-only range string like '(47-66)' when available
//   tbw: total body water as a fraction of body mass (L/kg ~ fraction) used in Mode B
//   tbw_note: display-only qualifiers like '(est.)' when TBW is a generic approximation
//   refs_bv / refs_tbw: short tags that map to the HTML reference list (for transparency)
//
// Unit conversions applied by the engine:
//   Mode A: Vblood(L) = BW(kg) * BV(mL/kg) / 1000
//   Mode B: Vtbw(L) ~= BW(kg) * TBW(fraction)   (1 kg water ~= 1 L)

export const SPECIES_DB = [
    { id: 'human', name: 'Human (Adult, generic)', weight: 70.0, bv: 70.0, bv_range: '(60-75)*', tbw: 0.55, tbw_note: '(50-60%)', refs_bv: '[H1,H2]', refs_tbw: '[W1]' },
    { id: 'human_male', name: 'Human (Adult male)', weight: 80.0, bv: 75.0, bv_range: '', tbw: 0.6, tbw_note: '', refs_bv: '[H2]', refs_tbw: '[W1]' },
    { id: 'human_female', name: 'Human (Adult female)', weight: 65.0, bv: 65.0, bv_range: '', tbw: 0.5, tbw_note: '', refs_bv: '[H2]', refs_tbw: '[W1]' },
    { id: 'mouse', name: 'Mouse', weight: 0.025, bv: 79.0, bv_range: '(78-80)', tbw: 0.725, tbw_note: '', refs_bv: '[B1]', refs_tbw: '[D1]' },
    { id: 'rat', name: 'Rat', weight: 0.25, bv: 64.0, bv_range: '(50-70)', tbw: 0.668, tbw_note: '', refs_bv: '[B1]', refs_tbw: '[D1]' },
    { id: 'rabbit', name: 'Rabbit', weight: 4.0, bv: 56.0, bv_range: '(44-70)', tbw: 0.716, tbw_note: '', refs_bv: '[B1]', refs_tbw: '[D1]' },
    { id: 'dog', name: 'Dog', weight: 10.0, bv: 86.0, bv_range: '(79-90)', tbw: 0.604, tbw_note: '', refs_bv: '[B1,Diehl]', refs_tbw: '[D1]' },
    { id: 'cat', name: 'Cat', weight: 4.0, bv: 55.0, bv_range: '(47-66)', tbw: 0.6, tbw_note: '(est.)', refs_bv: '[B1]', refs_tbw: '[W1]' },
    { id: 'guinea_pig', name: 'Guinea pig', weight: 0.8, bv: 75.0, bv_range: '(67-92)', tbw: 0.6, tbw_note: '(est.)', refs_bv: '[B1]', refs_tbw: '[W1]' },
    { id: 'hamster', name: 'Hamster', weight: 0.12, bv: 78.0, bv_range: '', tbw: 0.6, tbw_note: '(est.)', refs_bv: '[B1]', refs_tbw: '[W1]' },
    { id: 'gerbil', name: 'Gerbil', weight: 0.1, bv: 67.0, bv_range: '', tbw: 0.6, tbw_note: '(est.)', refs_bv: '[B1]', refs_tbw: '[W1]' },
    { id: 'ferret', name: 'Ferret', weight: 1.2, bv: 75.0, bv_range: '', tbw: 0.6, tbw_note: '(est.)', refs_bv: '[B1]', refs_tbw: '[W1]' },
    { id: 'monkey_rhesus', name: 'Monkey (rhesus)', weight: 5.0, bv: 54.0, bv_range: '', tbw: 0.693, tbw_note: '', refs_bv: '[B1]', refs_tbw: '[D1]' },
    { id: 'marmoset', name: 'Marmoset', weight: 0.35, bv: 65.0, bv_range: '(60-70)', tbw: 0.6, tbw_note: '(est.)', refs_bv: '[VT1,Wolf]', refs_tbw: '[W1]' },
    { id: 'pig', name: 'Pig', weight: 90.0, bv: 65.0, bv_range: '', tbw: 0.6, tbw_note: '(est.)', refs_bv: '[B1,VT1]', refs_tbw: '[W1]' },
    { id: 'sheep', name: 'Sheep', weight: 55.0, bv: 60.0, bv_range: '', tbw: 0.6, tbw_note: '(est.)', refs_bv: '[B1,VT1]', refs_tbw: '[W1]' },
    { id: 'goat', name: 'Goat', weight: 50.0, bv: 70.0, bv_range: '', tbw: 0.6, tbw_note: '(est.)', refs_bv: '[B1,VT1]', refs_tbw: '[W1]' },
    { id: 'cow', name: 'Cow', weight: 600.0, bv: 55.0, bv_range: '(52-57)', tbw: 0.6, tbw_note: '(est.)', refs_bv: '[VT1,Rey]', refs_tbw: '[W1]' },
    { id: 'horse', name: 'Horse', weight: 500.0, bv: 76.0, bv_range: '', tbw: 0.6, tbw_note: '(est.)', refs_bv: '[VT1]', refs_tbw: '[W1]' },
];
