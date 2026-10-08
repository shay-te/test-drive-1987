import { Display } from './core/Display.js';
import { Game } from './core/Game.js';
import { InputManager } from './core/InputManager.js';
import { ResourceManager } from './core/ResourceManager.js';
import { AudioManager } from './audio/AudioManager.js';
import { PreviewScreen } from './ui/screens/PreviewScreen.js';
import { WorldView } from './world/WorldView.js';

const resources = new ResourceManager();
const display = new Display(document.getElementById('stage'));
new Game({
    display,
    audio: new AudioManager(resources),
    input: new InputManager(window, null),
    world: new WorldView(display, resources),
}, { preview: PreviewScreen }).start('preview');
