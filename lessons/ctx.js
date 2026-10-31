// Shared state for the signed-in person (set by app.js after sign-in).
export const ctx = { profile: null, student: null };
export const isTeacher = () => ctx.profile && ctx.profile.role === 'teacher';
export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };
