import { createGame, currentPlayer, dispatch, Phase } from './core/game.js';
import { publicView, chooseCommand } from './ai/strategy.js';
import { createView } from './ui/game-view.js';
import { presentationSettings } from './config/game-config.js';
import { exportSave, importSave } from './core/save.js';
import { playCue } from './ui/sound.js';
import './ui/styles.css';
import './ui/tabletop.css';

let state = createGame();
let speed = 'normal';
let timer;
let generation = 0;
let scheduleSerial = 0;
let paused = false;
let sound = false;
let pendingImport = null;
let importRequest = 0;
let pausedBeforeImport = false;
const view = createView(document.querySelector('#app'), execute, start, (value) => {
  speed = value;
  schedule();
}, {
  onExport() {
    const blob = new Blob([exportSave(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `三国大富翁-第${state.round}轮.json`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    view.message('存档已导出。请保留 JSON 文件，刷新不会自动保存。');
  },
  async onImport(file) {
    if (file.size > 2000000) { view.message('存档文件超过 2 MB，无法导入。'); return; }
    const epoch = generation;
    const request = ++importRequest;
    try {
      const loaded = importSave(await file.text());
      if (epoch !== generation || request !== importRequest) return;
      if (!pendingImport) pausedBeforeImport = paused;
      pendingImport = loaded; paused = true; view.paused(true); schedule(); view.confirmImport(loaded);
    } catch (error) { if (epoch === generation && request === importRequest) view.message(`${error.message}；当前对局保持不变。`); }
  },
  onConfirmImport() {
    if (!pendingImport) return;
    clearTimeout(timer); generation++;
    importRequest++;
    state = pendingImport; pendingImport = null; paused = false;
    view.reset(); view.hideImport(); view.paused(false); view.render(state);
    view.message('存档已恢复，继续按原随机数和流程行动。'); schedule();
  },
  onCancelImport() { importRequest++; pendingImport = null; view.hideImport(); paused = pausedBeforeImport; view.paused(paused); schedule(); },
  onPause() {
    if (pendingImport) { view.message('请先确认或取消导入。'); return; }
    paused = !paused; view.paused(paused); view.render(state); schedule();
  },
  onSound() { sound = !sound; view.sound(sound); if (sound) playCue('BUY'); },
});

function execute(command) {
  if (paused) return;
  const result = dispatch(state, command);
  if (!result.accepted) { view.message(result.error); return; }
  state = result.state;
  if (sound && ['ROLL', 'BUY', 'UPGRADE', 'USE_CARD', 'BANKRUPT'].includes(command.type)) playCue(command.type);
  view.message('');
  view.render(state, result.events);
  schedule();
}
function start(options) {
  clearTimeout(timer); generation++;
  importRequest++;
  pendingImport = null; paused = false; view.reset(); view.hideImport(); view.paused(false);
  state = createGame(options);
  view.message(''); view.render(state); schedule();
}
function schedule() {
  clearTimeout(timer);
  view.cancelMotion();
  const serial = ++scheduleSerial;
  if (paused || state.phase === Phase.GAME_OVER) return;
  const actor = currentPlayer(state);
  const command = state.phase === Phase.MOVING
    ? { type: 'FINISH_MOVE', actorId: actor.id, revision: state.revision }
    : actor.human ? null : chooseCommand(publicView(state));
  if (!command) return;
  const epoch = generation;
  if (state.phase === Phase.MOVING) {
    const valid = () => epoch === generation && serial === scheduleSerial && !paused;
    const delay = () => presentationSettings.delays[speed];
    const move = state.move;
    void view.animateDice(state.dice, delay, valid).then(() => {
      if (valid()) return view.animateMove(move, actor.id, delay, valid);
    }).then(() => {
      if (epoch === generation && serial === scheduleSerial && !paused) execute(command);
    });
    return;
  }
  timer = setTimeout(() => {
    if (epoch === generation) execute(command);
  }, presentationSettings.delays[speed]);
}
view.render(state);
schedule();
