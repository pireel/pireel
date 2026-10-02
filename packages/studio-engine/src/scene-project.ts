import type { CaptionTaskOptions } from './caption-task';
import type { AsrSegment } from './build-blocks';
import type { EditorDocumentV2 } from './composition';

export type CaptionTaskStage = 'waiting' | 'ready' | 'preparing' | 'analyzing' | 'matching' | 'generating' | 'transcribing' | 'cleaning' | 'translating' | 'emphasizing' | 'voicing' | 'aligning' | 'lipsync' | 'styling' | 'rendering' | 'completed' | 'failed' | 'interrupted';
export type CaptionProcessingStage = 'preparing' | 'analyzing' | 'matching' | 'generating' | 'transcribing' | 'cleaning' | 'translating' | 'styling' | 'emphasizing' | 'voicing' | 'aligning' | 'lipsync' | 'rendering';
export interface CaptionStageProgress { status: 'pending' | 'running' | 'completed'; fraction?: number; detail?: string; done?: number; total?: number;
  /** Things the stage makes one by one (AI stills): what each is for, how far it is, and its picture once made. */
  items?: { label: string; status: 'pending' | 'running' | 'completed'; image?: string }[] }
export type CaptionTaskProgress = Partial<Record<CaptionProcessingStage, CaptionStageProgress>>;
export interface CaptionTaskRecord {
  workflowEnvironmentRevision?: string;
  workflow?: import('./workflow').WorkflowRun;
  workflowDefinition?: import('./workflow').WorkflowDefinition;
  workflowData?: import('./workflow-artifacts').SceneWorkflowData;
  scene?: 'captions' | 'dubbing' | 'broll' | 'pip' | 'sfx' | 'subtitle-removal' | 'ugc-ad'; dubbing?: import('@pireel/studio-engine/dubbing-task').DubbingState;
  broll?: { analyzedAssets?: string[]; candidates: import('./broll-task').BrollCandidate[]; analysisKey: string; planKey?: string; placements?: import('./broll-task').BrollPlacement[]; outputSig?: string };
  cloudRevision?: number; cloudPending?: boolean; cloudError?: string; coverSig?: string;
  id: string; scope: string; name: string; sourceSig: string; width: number; height: number; durationSec: number;
  options: CaptionTaskOptions; stage: CaptionTaskStage; updatedAt: number; error?: string; transcript?: AsrSegment[];
  generationId?: string; draftOptions?: CaptionTaskOptions; progress?: CaptionTaskProgress;
  translation?: { language: string; sourceKey: string };
  cuts?: { fromSec: number; toSec: number }[]; document?: EditorDocumentV2; draftDocument?: EditorDocumentV2; projectId?: string; archivedAt?: number; metadataUpdatedAt?: number; coverThumb?: string;
}

export interface CaptionTaskVersion { id: string; number: number; createdAt: number; task: CaptionTaskRecord }
export type CaptionVersionSummary = Pick<CaptionTaskVersion, 'id' | 'number' | 'createdAt'>;
export type CaptionProjectSummary = Pick<CaptionTaskRecord, 'id' | 'scope' | 'name' | 'updatedAt' | 'durationSec' | 'stage' | 'coverThumb' | 'scene' | 'cloudPending' | 'cloudError'>;
export interface CloudSceneProject { task: CaptionTaskRecord; revision: number }
export interface CloudSceneVersion { version: CaptionTaskVersion; resultSig: string }
export interface SceneProjectStore {
  owner(): Promise<string>;
  list(): Promise<CaptionProjectSummary[]>;
  load(id: string): Promise<CloudSceneProject | null>;
  save(task: CaptionTaskRecord, revision: number): Promise<CloudSceneProject>;
  patch(id: string, patch: { name?: string; archivedAt?: number; coverSig?: string }): Promise<CloudSceneProject>;
  versions(id: string): Promise<CaptionVersionSummary[]>;
  version(id: string, versionId: string): Promise<CloudSceneVersion | null>;
  saveVersion(id: string, version: CaptionTaskVersion, resultSig: string): Promise<CloudSceneVersion>;
}
