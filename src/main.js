import { AudioManager } from './audio/AudioManager.js';
import { Display } from './core/Display.js';
import { Game } from './core/Game.js';
import { HighScores } from './core/HighScores.js';
import { InputManager } from './core/InputManager.js';
import { ResourceManager } from './core/ResourceManager.js';
import { StageLoader, stageLayout } from './core/StageLoader.js';
import { DriveScreen } from './ui/screens/DriveScreen.js';
import { ResultsScreen } from './ui/screens/ResultsScreen.js';
import { SelectScreen } from './ui/screens/SelectScreen.js';
import { StationScreen } from './ui/screens/StationScreen.js';
import { TitleScreen } from './ui/screens/TitleScreen.js';
import { WorldView } from './world/WorldView.js';

const display = new Display(document.getElementById('stage'));
const resources = new ResourceManager();
const world = new WorldView(display, resources);
const game = new Game(
    {
        display,
        resources,
        audio: new AudioManager(resources),
        input: new InputManager(window, document.getElementById('touch-controls')),
        world,
        stages: new StageLoader(world, stageLayout(new URL('./sim/stageWorker.js', import.meta.url))),
        scores: new HighScores(),
    },
    {
        title: TitleScreen,
        select: SelectScreen,
        drive: DriveScreen,
        station: StationScreen,
        results: ResultsScreen,
    },
);
game.start('title');
