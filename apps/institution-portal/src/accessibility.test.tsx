import { render } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { App } from './App.js';

describe('automated accessibility smoke', () => {
  it.each([
    ['BATCH', 'INSTITUTION_OPERATOR'],
    ['CASEWORK', 'INSTITUTION_ADMINISTRATOR'],
    ['CASEWORK', 'AICTE_REVIEWER'],
    ['CASEWORK', 'AICTE_CHECKER'],
    ['INTEGRATIONS', 'AUDITOR'],
    ['INTEGRATIONS', 'AUTHORIZED_VERIFIER'],
    ['PILOT', 'INSTITUTION_ADMINISTRATOR'],
    ['PILOT', 'AICTE_CHECKER'],
  ] as const)('has no detectable violations in %s for %s', async (initialView, initialRole) => {
    const { container } = render(<App initialRole={initialRole} initialView={initialView} />);
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((violation) => violation.id)).toEqual([]);
  });
});
