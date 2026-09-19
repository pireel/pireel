import { expect, it } from 'vitest';
import { createWorkflowRegistry } from './workflow-registry';
import { GENERIC_WORKFLOW_CAPABILITIES } from './workflow-generic';
it('only advertises installed handlers for the chosen host and refuses duplicate versions',()=>{
 const capability=GENERIC_WORKFLOW_CAPABILITIES[0];
 const node={capability,execute:async()=>({status:'completed' as const,summary:'done',artifact:{kind:'value' as const,data:{value:'ok'}}})};
 expect(()=>createWorkflowRegistry('browser',[node])).toThrow('environment');
 expect(()=>createWorkflowRegistry('cloud',[node,node])).toThrow('Duplicate');
 expect(createWorkflowRegistry('cloud',[node]).catalog.map(c=>c.id)).toEqual(['llm.transform']);
});
