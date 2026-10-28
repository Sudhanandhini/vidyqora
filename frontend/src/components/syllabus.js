// Mirrors DEFAULT_SCHEME / schemeOf in backend/src/models/Course.js.
export const DEFAULT_SCHEME = {
  theory: [{ key: 'MSE', label: 'Mid-Semester Exam', max: 40 }, { key: 'ESE', label: 'End-Semester Exam', max: 60 }],
  sessional: [{ key: 'CPA', label: 'Continuous Practical Assessment', max: 20 }, { key: 'ESE', label: 'End-Semester Exam', max: 30 }],
};
export const PAPER_TYPES = [{ value: 'theory', label: 'Theory' }, { value: 'sessional', label: 'Sessional (lab / practical)' }];

export const schemeOf = (c) => (c?.evaluation?.length ? c.evaluation : DEFAULT_SCHEME[c?.type || 'theory']);
export const schemeTotal = (scheme) => scheme.reduce((t, p) => t + Number(p.max || 0), 0);
// Pass mark for the sub-total: as set on the course, else 40% of the total.
export const passOf = (c) => c?.passMarks ?? Math.ceil(schemeTotal(schemeOf(c)) * 0.4);
export const schemeText =(c) => { const s = schemeOf(c); return `${s.map((p) => `${p.key} ${p.max}`).join(' + ')} = ${schemeTotal(s)}`; };
