/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken, CodeLens, Command, Location, Range } from 'vscode-languageserver-protocol'
import { TextDocument } from 'coc.nvim'
import * as Proto from '../protocol'
import * as PConst from '../protocol.const'
import * as typeConverters from '../utils/typeConverters'
import { TypeScriptBaseCodeLensProvider, getSymbolRange } from './baseCodeLensProvider'

export default class TypeScriptImplementationsCodeLensProvider extends TypeScriptBaseCodeLensProvider {
  public async resolveCodeLens(
    codeLens: CodeLens,
    token: CancellationToken
  ): Promise<CodeLens> {
    let { uri } = codeLens.data
    let filepath = this.client.toPath(uri)

    const args = typeConverters.Position.toFileLocationRequestArgs(
      filepath,
      codeLens.range.start
    )
    const response = await this.client.execute('implementation', args, token, { lowPriority: true })
    if (response.type !== 'response' || !response.body) {
      codeLens.command = {
        title: response.type === 'cancelled'
          ? 'cancelled'
          : 'could not determine implementation',
        command: ''
      }
      return codeLens
    }
    const locations = response.body
      .map(reference => {
        return {
          uri: this.client.toResource(reference.file),
          range: {
            start: typeConverters.Position.fromLocation(reference.start),
            end: {
              line: reference.start.line,
              character: 0
            }
          }
        }
      })
      // Exclude original from implementations
      .filter(
        location => !(
          location.uri.toString() === uri &&
          location.range.start.line === codeLens.range.start.line &&
          location.range.start.character ===
          codeLens.range.start.character
        )
      )
    codeLens.command = this.getCommand(locations, codeLens)
    return codeLens
  }

  private getCommand(
    locations: Location[],
    codeLens: CodeLens,
  ): Command | undefined {
    let { uri } = codeLens.data
    return {
      title: this.getTitle(locations),
      command: locations.length ? 'editor.action.showReferences' : '',
      arguments: [uri, codeLens.range.start, locations]
    }
  }

  private getTitle(locations: Location[]): string {
    return locations.length === 1 ? '1 implementation' : `${locations.length} implementations`
  }

  protected extractSymbol(
    document: TextDocument,
    item: Proto.NavigationTree,
    _parent: Proto.NavigationTree | null
  ): Range | null {
    switch (item.kind) {
      case PConst.Kind.interface:
        return getSymbolRange(document, item)

      case PConst.Kind.class:
      case PConst.Kind.method:
      case PConst.Kind.memberVariable:
      case PConst.Kind.memberGetAccessor:
      case PConst.Kind.memberSetAccessor:
        if (item.kindModifiers.match(/\babstract\b/g)) {
          return getSymbolRange(document, item)
        }
        break
    }
    return null
  }
}
