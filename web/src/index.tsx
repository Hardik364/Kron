import { render } from 'solid-js/web';
import App from './App';
import './styles/global.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Root element #root not found in document. Check index.html.');
}

render(() => <App />, root);
