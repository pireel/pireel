import { PireelEditor } from '@pireel/studio-ui/editor';
import { studioProviders } from '@pireel/studio-engine/providers';
import { shellLocale } from './locale';
const providers = studioProviders();
export function App() {
  return <PireelEditor projectId="local" locale={shellLocale} providers={providers} className="h-screen w-full"/>;
}
