import {Injectable, Optional, Autowired, Inject} from '@ali/common-di';
import { JSONType, ExtensionService, IExtension, IExtensionProps, IExtensionMetaData } from '../common';
import { getLogger, Disposable } from '@ali/ide-core-common';
import { VSCodeMetaService } from './vscode/meta';

const metaDataSymbol = Symbol.for('metaDataSymbol');
const extensionServiceSymbol = Symbol.for('extensionServiceSymbol');

@Injectable({multiple: true})
export class Extension extends Disposable implements IExtension {
  public readonly id: string;
  public readonly extensionId: string;
  public readonly name: string;
  public readonly extraMetadata: JSONType = {};
  public readonly packageJSON: JSONType;
  public readonly path: string;
  public readonly realPath: string;
  public readonly extendConfig: JSONType;
  public readonly enableProposedApi: boolean;

  private _activated: boolean;
  private _activating: Promise<void> | null = null;

  private _enabled: boolean;
  private _enabling: Promise<void> | null = null;

  private logger = getLogger();

  @Autowired(VSCodeMetaService)
  vscodeMetaService: VSCodeMetaService;

  constructor(
    @Optional(metaDataSymbol) private extensionData: IExtensionMetaData,
    @Optional(extensionServiceSymbol) private extensionService: ExtensionService,
    @Optional(Symbol()) public isUseEnable: boolean,
    @Optional(Symbol()) public isBuiltin: boolean) {
    super();

    this.packageJSON = this.extensionData.packageJSON;
    this.id = this.extensionData.id;
    this.extensionId = this.extensionData.extensionId;
    this.name = this.packageJSON.name;
    this.extraMetadata = this.extensionData.extraMetadata;
    this.path = this.extensionData.path;
    this.realPath = this.extensionData.realPath;
    this.extendConfig = this.extensionData.extendConfig || {};
    this.enableProposedApi = Boolean(this.extensionData.packageJSON.enableProposedApi);
  }

  get activated() {
    return this._activated;
  }

  get enabled() {
    return this._enabled;
  }

  set enabled(enable: boolean) {
    this._enabled = enable;
  }

  async enable() {

    // 插件市场是否启用
    if (!this.isUseEnable) {
      return;
    }

    if (this._enabled) {
      return ;
    }

    if (this._enabling) {
      return this._enabling;
    }

    this.addDispose(this.vscodeMetaService);
    this.logger.log(`${this.name} vscodeMetaService.run`);
    this._enabling = this.vscodeMetaService.run(this);

    await this._enabling;

    this._enabled = true;
    this._enabling = null;
  }

  async activate() {
    if (this._activated) {
      return ;
    }

    if (this._activating) {
      return this._activating;
    }

    this._activating = this.extensionService.activeExtension(this).then(() => {
      this._activated = true;
    }).catch((e) => {
      this.logger.error(e);
    });

    return this._activating;
  }

  toJSON(): IExtensionProps {
    return {
      id: this.id,
      extensionId: this.extensionId,
      name: this.name,
      activated: this.activated,
      enabled: this.enabled,
      packageJSON: this.packageJSON,
      path: this.path,
      realPath: this.realPath,
      isUseEnable: this.isUseEnable,
      extendConfig: this.extendConfig,
      enableProposedApi: this.enableProposedApi,
      extraMetadata: this.extraMetadata,
      isBuiltin: this.isBuiltin,
    };
  }

}
