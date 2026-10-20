import '@fontsource-variable/manrope';
import './ui/styles.css';
import { App } from './ui/app';

const root = document.getElementById('app')!;
const app = new App(root);
// exposed for QA / automated screenshots
(window as unknown as { __app: App }).__app = app;
app.start().catch((e) => {
  console.error(e);
  root.querySelector('.loader-text')!.textContent = 'Не удалось загрузить сцену. Обновите страницу.';
});
