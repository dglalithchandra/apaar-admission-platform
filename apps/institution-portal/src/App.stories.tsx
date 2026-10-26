import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { App } from './App.js';

const meta = {
  component: App,
  parameters: { layout: 'fullscreen' },
  title: 'Institution/Batch workspace',
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyWorkspace: Story = {};

export const InstitutionCasework: Story = {
  args: { initialRole: 'INSTITUTION_OPERATOR', initialView: 'CASEWORK' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /SYNTH-CASE-REF-0101/i });
    await userEvent.click(canvas.getByRole('button', { name: 'Create request' }));
    await userEvent.type(
      canvas.getByLabelText('Admission reference'),
      'SYNTH-REGISTRATION-STORY-001',
    );
    await userEvent.type(
      canvas.getByLabelText('Reason for the request'),
      'Synthetic Storybook correction request.',
    );
    await expect(canvas.getByRole('button', { name: 'Create draft' })).toBeEnabled();
  },
};

export const ReviewerCasework: Story = {
  args: { initialRole: 'AICTE_REVIEWER', initialView: 'CASEWORK' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /SYNTH-CASE-REF-0201/i }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Start review' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Declare no conflict' }));
    await userEvent.type(
      canvas.getByLabelText('Reasoned explanation'),
      'Synthetic evidence reviewed.',
    );
    await expect(canvas.getByRole('button', { name: 'Recommend approval' })).toBeEnabled();
  },
};

export const CheckerCasework: Story = {
  args: { initialRole: 'AICTE_CHECKER', initialView: 'CASEWORK' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole('button', { name: /SYNTH-CASE-REF-0301/i });
    await userEvent.type(
      canvas.getByLabelText('Reasoned explanation'),
      'Synthetic independent checker decision.',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Approve case' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Review implementation' }));
    await expect(canvas.getByRole('button', { name: 'Confirm implementation' })).toBeVisible();
  },
};
