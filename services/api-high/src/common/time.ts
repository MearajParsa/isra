export const addSec = (d: Date, sec: number): Date => new Date(d.getTime() + sec * 1000);
export const isoOf = (d: Date): string => d.toISOString();
