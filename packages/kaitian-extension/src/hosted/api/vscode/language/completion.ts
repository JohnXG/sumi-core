import { Uri as URI, Cache } from '@ali/ide-core-common';
import { ExtensionDocumentDataManager, ISuggestDataDto, ISuggestDataDtoField, ISuggestResultDto, ISuggestResultDtoField, RangeSuggestDataDto } from '../../../../common/vscode';
import * as Converter from '../../../../common/vscode/converter';
import type vscode from 'vscode';
import {
  CompletionContext,
  Position,
  CompletionItemInsertTextRule,
  CompletionItem,
  ChainedCacheId,
} from '../../../../common/vscode/model.api';
import { SnippetString, Range, CompletionList } from '../../../../common/vscode/ext-types';
import { CommandsConverter } from '../ext.host.command';
import { DisposableStore } from '@ali/ide-core-common';
import { getPerformance } from './util';

export class CompletionAdapter {
  private cache = new Cache<vscode.CompletionItem>('CompletionItem');
  private toDispose = new Map<number, DisposableStore>();

  static supportsResolving(provider: vscode.CompletionItemProvider): boolean {
    return typeof provider.resolveCompletionItem === 'function';
  }

  constructor(
    private readonly delegate: vscode.CompletionItemProvider,
    private readonly commandConverter: CommandsConverter,
    private readonly documents: ExtensionDocumentDataManager,
  ) { }

  async provideCompletionItems(
    resource: URI,
    position: Position,
    context: CompletionContext,
    token: vscode.CancellationToken,
  ) {
    const document = this.documents.getDocumentData(resource);
    if (!document) {
      return Promise.reject(
        new Error(`There are no document for  ${resource}`),
      );
    }

    const doc = document.document;
    const pos = Converter.toPosition(position);
    const replacing = doc.getWordRangeAtPosition(pos) || new Range(pos, pos);
    const inserting = replacing.with({ end: pos });
    const perf = getPerformance();
    const startTime = perf ? perf.now() : 0;
    const itemOrList = await this.delegate.provideCompletionItems(
      doc,
      pos,
      token,
      context,
    );
    const duration = perf ? Math.round(perf.now() - startTime) : 0;
    if (!itemOrList) {
      return undefined;
    }

    const isIncomplete = Array.isArray(itemOrList) ? false : itemOrList.isIncomplete;
    const list = Array.isArray(itemOrList) ? new CompletionList(itemOrList) : itemOrList;
    const pid = CompletionAdapter.supportsResolving(this.delegate) ? this.cache.add(list.items) : this.cache.add([]);
    const disposables = new DisposableStore();
    this.toDispose.set(pid, disposables);

    const completions: ISuggestDataDto[] = [];
    const result: ISuggestResultDto = {
      x: pid,
      [ISuggestResultDtoField.completions]: completions,
      [ISuggestResultDtoField.defaultRanges]: { replace: Converter.fromRange(replacing)!, insert: Converter.fromRange(inserting)! },
      [ISuggestResultDtoField.isIncomplete]: isIncomplete || undefined,
      [ISuggestResultDtoField.duration]: duration,
    };

    for (let i = 0; i < list.items.length; i++) {
      const item = list.items[i];
      // check for bad completion item first
      const dto = this.convertCompletionItem(item, [pid, i], inserting, replacing);
      completions.push(dto);
    }
    return result;
  }

  resolveCompletionItem(
    id: ChainedCacheId,
    token: vscode.CancellationToken,
  ): Promise<ISuggestDataDto | undefined> {
    if (typeof this.delegate.resolveCompletionItem !== 'function') {
      return Promise.resolve(undefined);
    }

    const item = this.cache.get(...id);
    if (!item) {
      return Promise.resolve(undefined);
    }

    return Promise.resolve(
      this.delegate.resolveCompletionItem(item, token),
    ).then((resolvedItem) => {
      if (!resolvedItem) {
        return undefined;
      }

      return this.convertCompletionItem(
        resolvedItem,
        id,
      );
    });
  }

  releaseCompletionItems(id: number) {
    this.cache.delete(id);
    const toDispose = this.toDispose.get(id);
    if (toDispose) {
      toDispose.dispose();
      this.toDispose.delete(id);
    }
    return Promise.resolve();
  }

  private convertCompletionItem(
    item: vscode.CompletionItem,
    id: ChainedCacheId,
    defaultInserting?: vscode.Range,
    defaultReplacing?: vscode.Range,
  ): ISuggestDataDto {
    const disposables = this.toDispose.get(id[0]);
    if (!disposables) {
      throw Error('DisposableStore is missing...');
    }

    const result: ISuggestDataDto = {
      x: id,
      [ISuggestDataDtoField.kind]: item.kind ? Converter.CompletionItemKind.from(item.kind) : undefined,
      [ISuggestDataDtoField.kindModifier]: item.tags && item.tags.map(Converter.CompletionItemTag.from),
      [ISuggestDataDtoField.label]: item.label,
      [ISuggestDataDtoField.detail]: item.detail,
      [ISuggestDataDtoField.documentation]: item.documentation,
      [ISuggestDataDtoField.filterText]: item.filterText,
      [ISuggestDataDtoField.sortText]: item.sortText,
      [ISuggestDataDtoField.preselect]: item.preselect ? item.preselect : undefined,
      [ISuggestDataDtoField.insertText]: '',
      [ISuggestDataDtoField.additionalTextEdits]: item.additionalTextEdits && item.additionalTextEdits.map(Converter.fromTextEdit),
      [ISuggestDataDtoField.command]: this.commandConverter.toInternal(item.command, disposables),
      [ISuggestDataDtoField.commitCharacters]: item.commitCharacters,
      [ISuggestDataDtoField.insertTextRules]: item.keepWhitespace ? CompletionItemInsertTextRule.KeepWhitespace : 0,
    };

    let range: vscode.Range | { inserting: vscode.Range, replacing: vscode.Range; } | undefined;
    if (item.textEdit) {
      range = item.textEdit.range;
    } else if (item.range) {
      range = item.range;
    }

    if (Range.isRange(range)) {
      result[ISuggestDataDtoField.range] = RangeSuggestDataDto.to(Converter.Range.from(range));
    } else if (
      range &&
      (!defaultInserting?.isEqual(range.inserting) ||
        !defaultReplacing?.isEqual(range.replacing))
    ) {
      result[ISuggestDataDtoField.range] = {
        insert: Converter.Range.from(range.inserting),
        replace: Converter.Range.from(range.replacing),
      };
    }

    if (item.textEdit) {
      result[ISuggestDataDtoField.insertText] = item.textEdit.newText;
    } else if (typeof item.insertText === 'string') {
      result[ISuggestDataDtoField.insertText] = item.insertText;
    } else if (item.insertText instanceof SnippetString) {
      result[ISuggestDataDtoField.insertText] = item.insertText.value;
      result[ISuggestDataDtoField.insertTextRules] = CompletionItemInsertTextRule.InsertAsSnippet;
    } else {
      result[ISuggestDataDtoField.insertText] = typeof item.label === 'string' ? item.label : item.label.label;
    }
    return result;
  }

  static hasResolveSupport(provider: vscode.CompletionItemProvider): boolean {
    return typeof provider.resolveCompletionItem === 'function';
  }
}
