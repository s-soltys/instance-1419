import './ui/styles.css';
import { AudioEngine } from './engine/AudioEngine';
import { DialogueRunner } from './engine/DialogueRunner';
import { DreamCanvas } from './engine/DreamCanvas';
import { MinigameRegistry } from './engine/minigames/MinigameRegistry';
import { OpticsScene } from './engine/OpticsScene';
import { StateStore } from './engine/StateStore';
import { StoryletScheduler } from './engine/StoryletScheduler';
import { TargetShowcaseScene } from './engine/TargetShowcaseScene';
import { VoiceEngine } from './engine/voice/VoiceEngine';
import { UIController } from './ui/UIController';

function bootstrap(): void {
  const appRoot = document.getElementById('app');
  if (!appRoot) {
    throw new Error('Missing #app root container');
  }

  const store = new StateStore();
  const audio = new AudioEngine();
  const voice = new VoiceEngine(audio);
  const scheduler = new StoryletScheduler();
  const minigames = new MinigameRegistry();
  const dialogue = new DialogueRunner(store, (cue) => audio.playCue(cue));

  const ui = new UIController(appRoot, store, audio, voice, dialogue, scheduler, minigames);
  const optics = new OpticsScene(
    ui.getOpticsMount(),
    (telemetry) => ui.onOpticsTelemetry(telemetry),
    (spec) => ui.onScanComplete(spec)
  );
  const showcase = new TargetShowcaseScene(ui.getShowcaseMount(), (t) => ui.onShowcaseTelemetry(t));
  const dream = new DreamCanvas(ui.getDreamMount());

  ui.attachRenderers(optics, showcase, dream);
}

bootstrap();
