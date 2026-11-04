import { execFile } from 'node:child_process';
import os from 'node:os';

/**
 * Comandos nativos por sistema. Sem shell: execFile com argumentos fixos,
 * então nada vindo da rede é interpolado em comandos.
 */
export const COMMANDS = {
  win32: {
    shutdown: ['shutdown', ['/s', '/t', '0']],
    restart: ['shutdown', ['/r', '/t', '0']],
    hibernate: ['shutdown', ['/h']],
    sleep: ['rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']],
    lock: ['rundll32.exe', ['user32.dll,LockWorkStation']],
  },
  darwin: {
    shutdown: ['osascript', ['-e', 'tell application "System Events" to shut down']],
    restart: ['osascript', ['-e', 'tell application "System Events" to restart']],
    sleep: ['pmset', ['sleepnow']],
    hibernate: ['pmset', ['sleepnow']],
    lock: ['pmset', ['displaysleepnow']],
  },
  linux: {
    shutdown: ['systemctl', ['poweroff']],
    restart: ['systemctl', ['reboot']],
    sleep: ['systemctl', ['suspend']],
    hibernate: ['systemctl', ['hibernate']],
    lock: ['loginctl', ['lock-session']],
  },
};

// Estado que o app mostra enquanto a máquina cai.
const STATE_AFTER = {
  shutdown: 'shutting_down',
  restart: 'restarting',
  sleep: 'sleeping',
  hibernate: 'sleeping',
  lock: null,
};

export class PowerManager {
  constructor({ allowed, platform = os.platform(), dryRun = process.env.PCR_DRY_RUN === '1', onState = () => {} }) {
    this.allowed = new Set(allowed);
    this.platform = platform;
    this.dryRun = dryRun;
    this.onState = onState;
    this.pending = null; // { action, at, timer }
  }

  supports(action) {
    return Boolean(COMMANDS[this.platform]?.[action]) && this.allowed.has(action);
  }

  /** Agenda a ação. Retorna { action, at } ou lança Error. */
  schedule(action, delaySec = 0) {
    if (!this.supports(action)) throw new Error(`ação não suportada/permitida: ${action}`);
    if (this.pending) throw new Error(`já existe uma ação pendente: ${this.pending.action}`);
    const delay = Math.min(Math.max(Number(delaySec) || 0, 0), 600);
    const at = Date.now() + delay * 1000;
    const timer = setTimeout(() => this.#run(action), delay * 1000);
    this.pending = { action, at, timer };
    this.onState({ pending: { action, at } });
    return { action, at };
  }

  cancel() {
    if (!this.pending) return false;
    clearTimeout(this.pending.timer);
    this.pending = null;
    this.onState({ pending: null });
    return true;
  }

  #run(action) {
    this.pending = null;
    const [bin, args] = COMMANDS[this.platform][action];
    const state = STATE_AFTER[action];
    if (state) this.onState({ state, pending: null });
    if (this.dryRun) {
      console.log(`[power] DRY-RUN ${bin} ${args.join(' ')}`);
      return;
    }
    console.log(`[power] ${bin} ${args.join(' ')}`);
    execFile(bin, args, { windowsHide: true }, (err) => {
      if (err) {
        console.error('[power] falhou:', err.message);
        this.onState({ state: 'online', error: err.message, pending: null });
      }
    });
  }
}
