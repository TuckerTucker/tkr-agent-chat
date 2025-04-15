import type { Meta, StoryObj } from '@storybook/react';
import AgentAvatar from '../components/agent-avatar'; // Adjust path as needed

// Mock AgentConfig data based on Python config provided earlier
const chloeConfig = {
  id: 'chloe',
  name: 'Chloe',
  color: 'rgb(34 197 94)', // Green from agents/chloe/src/config.py
};

const philConfig = {
  id: 'phil_connors',
  name: 'Phil_Connors', // Name from agents/phil_connors/src/config.py
  color: 'rgb(249 115 22)', // Orange from agents/phil_connors/src/config.py
};

const unknownAgentConfig = {
    id: 'unknown_agent',
    name: 'Unknown Agent',
    color: 'rgb(100 100 100)', // A generic grey color
};

// Define the Meta object for Storybook
const meta: Meta<typeof AgentAvatar> = {
  title: 'Components/AgentAvatar', // Storybook sidebar path
  component: AgentAvatar,
  parameters: {
    // Optional parameters like layout
    layout: 'centered',
  },
  tags: ['autodocs'], // Enable automatic documentation generation
  argTypes: {
    // Define controls for props
    agent: {
      control: 'object',
      description: 'Agent configuration object (id, name, color)',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size of the avatar',
    },
    className: {
      control: 'text',
      description: 'Optional additional CSS classes',
    },
  },
  args: { // Default args for controls
    size: 'md',
    className: '',
  }
};

export default meta;

// Define Story types
type Story = StoryObj<typeof meta>;

// Define individual stories
export const Chloe: Story = {
  args: {
    agent: chloeConfig,
  },
};

export const PhilConnors: Story = {
  args: {
    agent: philConfig,
  },
};
