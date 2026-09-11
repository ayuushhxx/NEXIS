import { USER_COLOR } from '../theme/brand';

export const USER_ID = 'user';
export const USER_NAME = 'User';
export const MAX_AGENTS = 6;
export { USER_COLOR };
export const DEFAULT_AGENTIC_SET_ID = 'forge-nexus-network';

export interface AgentNode {
  id: string;
  index: number;
  name: string;
  description: string;
  color: string;
  model: string;
  humanInTheLoop?: boolean;
  position?: { x: number; y: number };
  subagents?: AgentNode[];
}

export type OutputType = 'text' | 'image' | 'music' | 'video';
export interface AgenticSystem {
  id: string;
  teamName: string;
  teamType: string;
  teamDescription: string;
  color: string;
  outputType: OutputType;
  outputModel: string;
  outputAutoApprove?: boolean;
  user: {
    index: number;
    model: string;
    position?: { x: number; y: number };
  };
  leadAgent: AgentNode;
}

export const AGENTIC_SETS: AgenticSystem[] = [
  {
    id: 'forge-nexus-network',
    teamName: 'Nexus Agent Network',
    teamType: 'Career Orchestration',
    teamDescription: 'Forge career system for resume optimization, job discovery, proof-of-work verification, and interview simulation.',
    color: '#2563eb',
    outputType: 'text',
    outputModel: 'claude-sonnet-4',
    outputAutoApprove: false,
    user: { index: 0, model: 'Human', position: { x: 0, y: 0 } },
    leadAgent: {
      id: 'nexus-director',
      index: 1,
      name: 'Nexus-Director',
      description: 'Manager agent orchestrating the full career strategy command center.',
      color: '#4f46e5',
      model: 'claude-sonnet-4',
      humanInTheLoop: true,
      position: { x: 0, y: 130 },
      subagents: [
        {
          id: 'nexus-vision',
          index: 2,
          name: 'Nexus-Vision',
          description: 'Eye-Tracking Simulation and Visual UX Auditor.',
          color: '#2563eb',
          model: 'codex-1',
          position: { x: -480, y: 280 },
        },
        {
          id: 'nexus-strategist',
          index: 3,
          name: 'Nexus-Strategist',
          description: 'JD intent miner and red flag detector.',
          color: '#7c3aed',
          model: 'claude-3-7-sonnet',
          position: { x: -240, y: 280 },
        },
        {
          id: 'nexus-writer',
          index: 4,
          name: 'Nexus-Writer',
          description: 'STAR-metric engineer and content optimizer.',
          color: '#10b981',
          model: 'sarvam-105b',
          position: { x: 0, y: 280 },
        },
        {
          id: 'nexus-hunter',
          index: 5,
          name: 'Nexus-Hunter',
          description: 'Blue ocean job discovery agent.',
          color: '#f59e0b',
          model: 'codex-mini',
          position: { x: 240, y: 280 },
        },
        {
          id: 'nexus-mirror',
          index: 6,
          name: 'Nexus-Mirror',
          description: 'Deep interview simulator and post-game analyzer.',
          color: '#ef4444',
          model: 'claude-haiku-3.5',
          humanInTheLoop: true,
          position: { x: 480, y: 280 },
        },
      ],
    },
  },
];

export function getAgentSet(id: string, customSystems: AgenticSystem[] = []): AgenticSystem {
  return (
    customSystems.find((s) => s.id === id) ||
    AGENTIC_SETS.find((s) => s.id === id) ||
    AGENTIC_SETS[0]
  );
}

export function getAllAgents(system: AgenticSystem): AgentNode[] {
  const agents: AgentNode[] = [];
  const traverse = (node: AgentNode) => {
    agents.push(node);
    if (node.subagents) {
      node.subagents.forEach(traverse);
    }
  };
  traverse(system.leadAgent);
  return agents;
}

export function getAllCharacters(system: AgenticSystem): AgentNode[] {
  const userNode: AgentNode = {
    id: USER_ID,
    index: system.user.index,
    name: USER_NAME,
    color: USER_COLOR,
    model: system.user.model,
    description: 'Human user issuing career directives.',
  };
  return [userNode, ...getAllAgents(system)];
}
