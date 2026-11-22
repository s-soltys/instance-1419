import './ui/styles.css';
import { AudioEngine } from './engine/AudioEngine';
import { DialogueRunner } from './engine/DialogueRunner';
import { DreamCanvas } from './engine/DreamCanvas';
import { OpticsScene } from './engine/OpticsScene';
import { StateStore } from './engine/StateStore';
import { StoryletScheduler } from './engine/StoryletScheduler';
import { UIController } from './ui/UIController';

function bootstrap(): void {
  const appRoot = document.getElementById('app');
  if (!appRoot) {
    throw new Error('Missing #app root container');
  }

  const store = new StateStore();
  const audio = new AudioEngine();
  const scheduler = new StoryletScheduler();
  const dialogue = new DialogueRunner(store, (cue) => audio.playCue(cue));

  const ui = new UIController(appRoot, store, audio, dialogue, scheduler);
  const optics = new OpticsScene(
    ui.getOpticsMount(),
    (telemetry) => ui.onOpticsTelemetry(telemetry),
    (spec) => ui.onScanComplete(spec)
  );
  const dream = new DreamCanvas(ui.getDreamMount());

  ui.attachRenderers(optics, dream);
}

bootstrap();
