import type { Meta, StoryObj } from '@storybook/react-vite';
import { App } from './App.js';

const meta = {
  component: App,
  parameters: { layout: 'fullscreen' },
  title: 'Institution/Batch workspace',
} satisfies Meta<typeof App>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyWorkspace: Story = {};
