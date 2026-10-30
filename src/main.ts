import './ui/style.css';
import { mount } from './ui/app';
import { preloadArt } from './ui/art';
mount(document.querySelector<HTMLDivElement>('#app')!);
preloadArt();
