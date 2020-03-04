import { mockElectronRenderer } from '@ali/ide-core-common/lib/mocks/electron/browserMock';
import { createBrowserInjector } from '../../../../tools/dev-tool/src/injector-helper';
import { IElectronMainUIService } from '@ali/ide-core-common/lib/electron';
import { ElectronPlainWebviewWindow } from '@ali/ide-webview/lib/browser/webview-window';
import { Emitter } from '@ali/ide-core-common';

describe('webview-window-test', () => {

  const injector = createBrowserInjector([]);

  injector.addProviders({
    token: IElectronMainUIService,
    useValue: {},
  });
  it('webview-window class test', async (done) => {

    mockElectronRenderer();

    const windowId = Math.floor(Math.random() * 10);
    const emitter = new Emitter<number>();
    let windowCalledEnvJSON;

    const createWindow = jest.fn(async (options) => {
      windowCalledEnvJSON = options.webPreferences.additionalArguments[0].substr('--additionalEnv='.length);
      return windowId;
    });

    const onListen = jest.fn((eventName, listener) => {
      return emitter.event(listener);
    });

    const showBrowserWindow = jest.fn();
    const browserWindowLoadUrl = jest.fn();
    const postMessageToBrowserWindow = jest.fn();

    injector.mock(IElectronMainUIService, 'createBrowserWindow', createWindow);
    injector.mock(IElectronMainUIService, 'showBrowserWindow', showBrowserWindow);
    injector.mock(IElectronMainUIService, 'browserWindowLoadUrl', browserWindowLoadUrl);
    injector.mock(IElectronMainUIService, 'postMessageToBrowserWindow', postMessageToBrowserWindow);
    injector.mock(IElectronMainUIService, 'on', onListen);

    const testEnv = { testKey: 'testValue' };

    const window = injector.get(ElectronPlainWebviewWindow, [{}, testEnv]);
    await (window as any)._ready;
    expect((window as any)._windowId).toBe(windowId);

    await expect(createWindow).toBeCalled();
    expect(windowCalledEnvJSON).toBe(JSON.stringify(testEnv));

    expect(onListen).toBeCalledTimes(1);

    await window.show();
    expect(showBrowserWindow).toBeCalledWith(windowId);

    const url = 'http://example.com';
    await window.loadURL(url);
    expect(window.url).toBe(url);
    expect(browserWindowLoadUrl).toBeCalledWith(windowId, url);

    const message = 'test Message';
    window.postMessage(message);
    expect(postMessageToBrowserWindow).toBeCalledWith(windowId, 'webview-message', message);

    const onClosed = jest.fn();
    window.onClosed(onClosed);

    emitter.fire(windowId);

    expect((window as any)._closed).toBeTruthy();
    expect(window.disposed).toBeTruthy();
    expect(onClosed).toBeCalledTimes(1);

    done();
  });

});