/**
 * SatQuery AI - Stage 4 Controlled Specialist Tool Registry
 * SIH26167 | ISRO Space Technology
 *
 * Controlled registry defining the 6 remote-sensing specialist capabilities.
 * All tools maintain status: 'planned' until verified model inference pipelines
 * are integrated in future phases. Planned tools MUST NEVER be executed.
 */

import { ControlledSpecialistTool, ParsedQueryTaskType } from '../types/index.js';

export const CONTROLLED_SPECIALIST_TOOLS: Record<string, ControlledSpecialistTool> = {
  'tool_vqa_specialist': {
    toolId: 'tool_vqa_specialist',
    taskType: 'vqa',
    displayName: 'Remote Sensing Visual Question Answering Specialist',
    supportedModalities: ['OPTICAL', 'MULTISPECTRAL'],
    minimumImageCount: 1,
    maximumImageCount: 1,
    requiresTemporalPair: false,
    requiresMultipleModalities: false,
    status: 'planned'
  },
  'tool_caption_specialist': {
    toolId: 'tool_caption_specialist',
    taskType: 'caption',
    displayName: 'Remote Sensing Scene Captioning Specialist',
    supportedModalities: ['OPTICAL', 'MULTISPECTRAL'],
    minimumImageCount: 1,
    maximumImageCount: 1,
    requiresTemporalPair: false,
    requiresMultipleModalities: false,
    status: 'planned'
  },
  'tool_grounding_specialist': {
    toolId: 'tool_grounding_specialist',
    taskType: 'grounding',
    displayName: 'Remote Sensing Visual Grounding Specialist',
    supportedModalities: ['OPTICAL', 'MULTISPECTRAL'],
    minimumImageCount: 1,
    maximumImageCount: 1,
    requiresTemporalPair: false,
    requiresMultipleModalities: false,
    status: 'planned'
  },
  'tool_segmentation_specialist': {
    toolId: 'tool_segmentation_specialist',
    taskType: 'segmentation',
    displayName: 'Remote Sensing Semantic Segmentation Specialist',
    supportedModalities: ['OPTICAL', 'MULTISPECTRAL'],
    minimumImageCount: 1,
    maximumImageCount: 1,
    requiresTemporalPair: false,
    requiresMultipleModalities: false,
    status: 'planned'
  },
  'tool_change_specialist': {
    toolId: 'tool_change_specialist',
    taskType: 'change_analysis',
    displayName: 'Remote Sensing Bi-Temporal Change Analysis Specialist',
    supportedModalities: ['OPTICAL', 'MULTISPECTRAL', 'SAR'],
    minimumImageCount: 2,
    maximumImageCount: 2,
    requiresTemporalPair: true,
    requiresMultipleModalities: false,
    status: 'planned'
  },
  'tool_optical_sar_specialist': {
    toolId: 'tool_optical_sar_specialist',
    taskType: 'optical_sar',
    displayName: 'Remote Sensing Optical-SAR Cross-Modal Specialist',
    supportedModalities: ['OPTICAL', 'SAR'],
    minimumImageCount: 2,
    maximumImageCount: 2,
    requiresTemporalPair: false,
    requiresMultipleModalities: true,
    status: 'planned'
  }
};

export function getControlledSpecialistTools(): ControlledSpecialistTool[] {
  return Object.values(CONTROLLED_SPECIALIST_TOOLS);
}

export function getSpecialistToolById(toolId: string): ControlledSpecialistTool | undefined {
  return CONTROLLED_SPECIALIST_TOOLS[toolId];
}

export function getSpecialistToolByTask(taskType: ParsedQueryTaskType): ControlledSpecialistTool | undefined {
  return Object.values(CONTROLLED_SPECIALIST_TOOLS).find((tool) => tool.taskType === taskType);
}
