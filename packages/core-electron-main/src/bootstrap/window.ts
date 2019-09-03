import { Disposable, getLogger, uuid, isOSX, isDevelopment, URI } from '@ali/ide-core-common';
import { Injectable, Autowired } from '@ali/common-di';
import { ElectronAppConfig, ICodeWindow } from './types';
import { BrowserWindow, shell, ipcMain } from 'electron';
import { ChildProcess, fork, ForkOptions } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs-extra';
import * as os from 'os';

const DEFAULT_WINDOW_HEIGHT = 700;
const DEFAULT_WINDOW_WIDTH = 1000;

@Injectable({multiple: true})
export class CodeWindow extends Disposable implements ICodeWindow {

  private _workspace: string | undefined;

  @Autowired(ElectronAppConfig)
  private appConfig: ElectronAppConfig;

  private browser: BrowserWindow;

  private node: KTNodeProcess | null = null;

  constructor(workspace?: string, metadata?: any) {
    super();
    this._workspace = workspace;
    this.browser = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: this.appConfig.browserNodeIntegrated,
        preload: this.appConfig.browserPreload,
        webviewTag: true,
      },
      frame: isOSX,
      titleBarStyle: 'hidden',
      height: DEFAULT_WINDOW_HEIGHT,
      width: DEFAULT_WINDOW_WIDTH,
    });
    this.browser.on('closed', () => {
      this.dispose();
    });
    const metadataResponser = (event, windowId) => {
      if (windowId === this.browser.id) {
        event.returnValue = JSON.stringify({
          workspace: this.workspace,
          webview: {
            webviewPreload: URI.file(this.appConfig.webviewPreload).toString(),
            plainWebviewPreload: URI.file(this.appConfig.plainWebviewPreload).toString(),
          },
          extensionDir: this.appConfig.extensionDir,
          ...metadata,
        });
      }
    };
    ipcMain.on('window-metadata',  metadataResponser);
    this.addDispose({
      dispose: () => {
        ipcMain.removeListener('window-metadata', metadataResponser);
      },
    });

  }

  get workspace() {
    return this._workspace;
  }

  async start() {
    this.clear();
    try {
      this.node = new KTNodeProcess(this.appConfig.nodeEntry, this.appConfig.extensionEntry);
      const rpcListenPath = join(os.tmpdir(), `${uuid()}.sock`);

      await this.node.start(rpcListenPath, this.workspace);
      getLogger().log('starting browser window with url: ', this.appConfig.browserUrl);
      this.browser.loadURL(this.appConfig.browserUrl);
      this.browser.show();
      this.browser.webContents.on('did-finish-load', () => {
        this.browser.webContents.send('preload:listenPath', rpcListenPath);
      });
      this.bindEvents();
    } catch (e) {
      getLogger().error(e);
    }
  }

  bindEvents() {
    // 外部打开http
    this.browser.webContents.on('new-window',
      (event, url) => {
        if (!event.defaultPrevented) {
          event.preventDefault();
          if (url.indexOf('http') === 0) {
            shell.openExternal(url);
          }
        }
    });
  }

  clear() {
    if (this.node) {
      // TODO Dispose
      this.node.dispose();
      this.node = null;
    }
  }

  close() {
    if (this.browser) {
      this.browser.close();
    }
  }

  dispose() {
    this.clear();
    super.dispose();
  }

  getBrowserWindow() {
    return this.browser;
  }
}

export class KTNodeProcess {

  private _process: ChildProcess;

  private ready: Promise<void>;

  constructor(private forkPath, private extensionEntry) {

  }

  async start(rpcListenPath: string, workspace: string | undefined) {

    if (!this.ready) {
      this.ready = new Promise((resolve, reject) => {
        try {
          const forkOptions: ForkOptions = {
            env: { ... process.env, KTELECTRON: '1', EXTENSION_HOST_ENTRY: this.extensionEntry},
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          };
          const forkArgs: string[] = [];
          forkOptions.env!.WORKSPACE_DIR = workspace;
          if (isDevelopment()) {
            forkOptions.execArgv = ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register']; // ts-node模式
          }
          forkArgs.push('--listenPath', rpcListenPath);
          this._process = fork(this.forkPath, forkArgs, forkOptions);
          this._process.on('message', (message) => {
            console.log(message);
            if (message === 'ready') {
              resolve();
            }
          });
          this._process.on('error', (error) => {
            reject(error);
          });
          this._process.stdout.on('data', (data) => {
            getLogger().log('[node]' + data );
          });
          this._process.stderr.on('data', (data) => {
            getLogger().error('[node]' + data );
          });
        } catch (e) {
          reject(e);
        }
      });
    }
    return this.ready;

  }

  get process() {
    return this._process;
  }

  dispose() {
    if (this._process) {
      this._process.kill();
    }
  }
}
