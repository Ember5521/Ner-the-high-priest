import { defineConfig } from 'vite';
import { editorPlugin } from './tools/editor-server';
export default defineConfig({ base: './', plugins: [editorPlugin()], build: { rollupOptions: { input: 'index.html' } } });
