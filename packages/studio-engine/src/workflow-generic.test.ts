import { describe, expect, it, vi } from 'vitest';
import { createWorkflowRun, validateWorkflow, workflowLiteral as literal, type WorkflowDefinition, type WorkflowRun } from './workflow';
import { GENERIC_WORKFLOW_CAPABILITIES as catalog, decideWorkflowApproval, genericWorkflowExecutor } from './workflow-generic';
import { executeWorkflow } from './workflow-runtime';
import { assertWorkflowValue, validateWorkflowSchema } from './workflow-schema';

const definition = (): WorkflowDefinition => ({ schemaVersion: 1, id: 'review-script', version: 1, title: '文案确认', templateId: 'custom', parameters: {}, trigger: {kind:'manual'}, steps: [
  {id:'rewrite',capability:'llm.transform',version:1,dependsOn:[],arguments:{instruction:literal('让文案更简洁'),value:literal('原稿'),schema:literal({type:'string',maxLength:100})}},
  {id:'review',capability:'human.approval',version:1,dependsOn:['rewrite'],arguments:{title:literal('确认稿件'),value:{kind:'step',stepId:'rewrite',key:'value'},schema:literal({type:'string',maxLength:100}),editable:literal(true),notify:literal(true)}},
  {id:'done',capability:'notification.send',version:1,dependsOn:['review'],arguments:{title:literal('已确认'),message:{kind:'step',stepId:'review',key:'value'}}},
] });
const makeRun = (def=definition()) => createWorkflowRun(def,{}, {projectId:'p',outputId:'o',revision:'1'},catalog,'run-test');

describe('generic workflow nodes',()=>{
 it('persists a review notice before approval and resumes without repeating the model call',async()=>{
  const transform=vi.fn(async()=> '精简稿');const executor=genericWorkflowExecutor({transform});const saved:WorkflowRun[]=[];
  const store={save:async(run:WorkflowRun)=>{saved.push(structuredClone(run));}};
  const waiting=await executeWorkflow(makeRun(),catalog,executor,store);
  expect(waiting.status).toBe('waiting');expect(waiting.steps[2].status).toBe('pending');
  expect(waiting.notices).toHaveLength(1);expect(waiting.notices![0].approvalId).toBe('run-test:review');
  expect(saved.at(-1)?.steps[1].approval?.status).toBe('pending');
  const stillWaiting=await executeWorkflow(waiting,catalog,executor,store);
  expect(stillWaiting.notices).toHaveLength(1);expect(transform).toHaveBeenCalledOnce();
  expect(()=>decideWorkflowApproval(waiting,'old-request','approve','owner')).toThrow();
  expect(()=>decideWorkflowApproval(waiting,'run-test:review','approve','owner',123)).toThrow();
  const approved=decideWorkflowApproval(waiting,'run-test:review','approve','owner','人工修改稿');
  expect(approved.steps[1].approval?.decidedBy).toBe('owner');
  expect(()=>decideWorkflowApproval(approved,'run-test:review','approve','owner')).toThrow();
  const completed=await executeWorkflow(approved,catalog,executor,store);
  expect(completed.status).toBe('completed');expect(completed.notices?.at(-1)?.message).toBe('人工修改稿');
  expect(transform).toHaveBeenCalledOnce();expect(waiting.steps[1].approval?.value).toBe('精简稿');
 });
 it('rejects invalid LLM output before reaching approval or notifications',async()=>{
  const run=await executeWorkflow(makeRun(),catalog,genericWorkflowExecutor({transform:async()=>({wrong:true})}),{save:async()=>{}});
  expect(run.status).toBe('failed');expect(run.steps[1].status).toBe('pending');expect(run.notices).toBeUndefined();
 });
 it('honors read-only review and rejection without executing downstream work',async()=>{
  const def=definition();def.steps[1].arguments.editable=literal(false);
  const run=await executeWorkflow(makeRun(def),catalog,genericWorkflowExecutor({transform:async()=> '稿件'}),{save:async()=>{}});
  expect(()=>decideWorkflowApproval(run,'run-test:review','approve','owner','其他内容')).toThrow('read-only');
  const rejected=decideWorkflowApproval(run,'run-test:review','reject','owner');
  expect(rejected.status).toBe('cancelled');expect(rejected.steps[2].status).toBe('pending');
 });
 it('validates ports and explicit bypasses before execution',()=>{
  const missing=definition();delete missing.steps[0].arguments.instruction;
  expect(()=>validateWorkflow(missing,catalog)).toThrow('Missing node input');
  const bad=definition();bad.steps[1].arguments.value={kind:'step',stepId:'rewrite',key:'typo'};
  expect(()=>validateWorkflow(bad,catalog)).toThrow('Unknown output port');
  const incompatible=definition();incompatible.steps[1].arguments.schema=literal({type:'number'});
  expect(()=>validateWorkflow(incompatible,catalog)).toThrow('Incompatible node ports');
  const optional=definition();optional.parameters.enabled={type:'boolean',default:false,label:{zh:'启用',en:'Enabled'}};
  optional.steps[0].enabledBy='enabled';
  expect(()=>validateWorkflow(optional,catalog)).toThrow('bypass');
  optional.steps[0].bypass={value:literal('原稿')};expect(validateWorkflow(optional,catalog)).toHaveLength(3);
 });
 it('passes through an optional node without spending on LLM',async()=>{
  const def=definition();def.parameters.enabled={type:'boolean',default:false,label:{zh:'启用',en:'Enabled'}};def.steps[0].enabledBy='enabled';def.steps[0].bypass={value:literal('原稿')};
  const transform=vi.fn();const run=await executeWorkflow(makeRun(def),catalog,genericWorkflowExecutor({transform}),{save:async()=>{}});
  expect(transform).not.toHaveBeenCalled();expect(run.steps[1].approval?.value).toBe('原稿');
 });
 it('refuses unsupported schemas and invalid object fields',()=>{
  expect(()=>validateWorkflowSchema({type:'array'})).toThrow();
  expect(()=>validateWorkflowSchema({type:'string',pattern:'.*'} as never)).toThrow('Unsupported');
  const schema={type:'object' as const,properties:{title:{type:'string' as const,maxLength:10}},required:['title']};
  validateWorkflowSchema(schema);expect(()=>assertWorkflowValue({title:'ok',extra:1},schema)).toThrow();
  expect(()=>assertWorkflowValue({},schema)).toThrow();assertWorkflowValue({title:'ok'},schema);
 });
});
