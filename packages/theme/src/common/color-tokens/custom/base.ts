
import { localize } from '@ali/ide-core-common';

import { registerColor } from '../../color-registry';
import { editorWarningForeground, editorErrorForeground, editorInfoForeground } from '../editor';
import { iconForeground } from '../base';

export const errorIconForeground = registerColor(
  'kt.errorIconForeground',
  { dark: editorErrorForeground, light: editorErrorForeground, hc: editorErrorForeground },
  localize('errorIconForeground', 'Foreground color for error icon'),
);

export const errorBackground = registerColor(
  'kt.errorBackground',
  { dark: '#D21F2840', light: '#FF787540', hc: null },
  localize('errorBackground', 'Background color for error text'),
);

/**
 * 备注: 为保障对 vscode theme 插件的最大程度兼容
 * 这里 [warning/error/info]IconForeground
 * 皆 fallback 到 vscode token 中 notificationsIcon 相关的默认值
 * 即全部 fallback 搭配 editorForeground 色值
 */
export const warningIconForeground = registerColor(
  'kt.warningIconForeground',
  { dark: editorWarningForeground, light: editorWarningForeground, hc: editorWarningForeground },
  localize('warningIconForeground', 'Foreground color for warning icon'),
);

export const warningBackground = registerColor(
  'kt.warningBackground',
  { dark: '#D7951340', light: '#FFD66640', hc: null },
  localize('warningBackground', 'Background color for warning text'),
);

export const succesIconForeground = registerColor(
  'kt.successIconForeground',
  { dark: '#DBA936', light: '#73D13D', hc: iconForeground },
  localize('successIconForeground', 'Foreground color for success icon'),
);

export const successBackground = registerColor(
  'kt.successBackground',
  { dark: '#D7951340', light: '#95DE6440', hc: null },
  localize('successBackground', 'Background color for success text'),
);

export const infoIconForeground = registerColor(
  'kt.infoIconForeground',
  { dark: editorInfoForeground, light: editorInfoForeground, hc: editorInfoForeground },
  localize('infoIconForeground', 'Foreground color for info icon'),
);

export const infoBackground = registerColor(
  'kt.infoBackground',
  { dark: '#167CDB40', light: '#6EB6FA40', hc: null },
  localize('infoBackground', 'Background color for info text'),
);

export const hintIconForeground = registerColor(
  'kt.hintIconForeground',
  { dark: '#868C91', light: '#999999', hc: iconForeground },
  localize('hintIconForeground', 'Foreground color for hint icon'),
);

export const hintBackground = registerColor(
  'kt.hintBackground',
  { dark: '#5F656B40', light: '#CCCCCC40', hc: null },
  localize('hintBackground', 'Background color for hint text'),
);