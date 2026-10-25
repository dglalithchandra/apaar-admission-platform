import '@testing-library/jest-dom/vitest';

Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:SYNTH-DOWNLOAD' });
Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined });
