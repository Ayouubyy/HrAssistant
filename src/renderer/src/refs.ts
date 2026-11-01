// Stable reference numbers used across the app.
export const cvRef = (n: number): string => `CV-${String(n).padStart(2, '0')}`
export const mailRef = (id: string): string => `MAIL-${id.slice(0, 4).toUpperCase()}`
