import './styles.css';
import './providers'; // capability injection — must run before the editor renders
import { createRoot } from 'react-dom/client';
import { App } from './app';

createRoot(document.getElementById('root')!).render(<App />);
