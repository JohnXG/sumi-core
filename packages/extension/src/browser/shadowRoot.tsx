import { ComponentContextProvider, IconContext, IIconResourceOptions } from '@opensumi/ide-components';
import { DisposableCollection, LabelService, useInjectable } from '@opensumi/ide-core-browser';
import { localize, URI } from '@opensumi/ide-core-common';
import { getThemeTypeSelector, IIconService, IThemeService, ThemeType } from '@opensumi/ide-theme';
import clx from 'classnames';
import React, { useCallback } from 'react';
import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

import { IExtension } from '../common';
import { AbstractViewExtProcessService } from '../common/extension.service';

const pkgJson = require('../../package.json');

const ShadowContent = ({ root, children }) => ReactDOM.createPortal(children, root);

function cloneNode<T>(head): T {
  return head.cloneNode(true);
}

/**
 * 由于经过 clone 以后，实际 Shadow DOM 中 head 与原始 proxiedHead 不是同一份引用
 * 插件中可能存在后置动态插入 style 的行为，此时只会获取到 proxiedHead
 * 所以这里观察原始 proxiedHead 的 DOM childList 变化
 * 当收到 mutations 时说明 head 标签被修改，将新插入的 style 节点 clone 一份到实际的 head 中
 * 删除节点同理
 */
function useMutationObserver(from: HTMLHeadElement, target: HTMLHeadElement) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        if (mutation.addedNodes.length > 0) {
          for (const addedNode of Array.from(mutation.addedNodes)) {
            // TODO: 加入真正的 typing
            target.appendChild((addedNode as any).cloneNode(true));
          }
        }
        if (mutation.removedNodes.length > 0) {
          for (const removedNode of Array.from(mutation.removedNodes)) {
            target.removeChild(removedNode as any);
          }
        }
      }
    }
  });
  observer.observe(from, {
    // 表示监听子元素列表变化
    childList: true,
    subtree: true,
  });
  return {
    dispose: () => {
      observer.disconnect();
    },
  };
}

/**
 * 弃用 unpkg.alibaba-inc.ocm 是因为其没有达到生产环境的可用性
 * https://gw.alipayobjects.com/os/lib/ali/ide-components/1.12.2/dist/index.css
 */
const componentCdnBase = 'https://gw.alipayobjects.com/os/lib';

function getStyleSheet(filePath: string, version: string) {
  const link = document.createElement('link');
  // basement 三方库不需要 @ 符
  link.setAttribute('href', `${componentCdnBase}/ali/ide-components/${version}/${filePath}`);
  link.setAttribute('rel', 'stylesheet');
  return link;
}

const ShadowRoot = ({ id, extensionId, children, proxiedHead }: { id: string, extensionId: string, children: any, proxiedHead: HTMLHeadElement }) => {
  const shadowRootRef = useRef<HTMLDivElement | null>(null);
  const [shadowRoot, setShadowRoot] = React.useState<ShadowRoot | null>(null);
  const viewExtensionService = useInjectable<AbstractViewExtProcessService>(AbstractViewExtProcessService);
  const themeService = useInjectable<IThemeService>(IThemeService);
  const iconService = useInjectable<IIconService>(IIconService);
  const [themeType, setThemeType] = useState<null | ThemeType>(null);

  useEffect(() => {
    const disposables = new DisposableCollection();
    if (shadowRootRef.current) {
      const shadowRootElement = shadowRootRef.current.attachShadow({ mode: 'open' });
      if (proxiedHead) {
        proxiedHead.appendChild(getStyleSheet('dist/index.css', pkgJson.version));
        proxiedHead.appendChild(getStyleSheet('lib/icon/iconfont/iconfont.css', pkgJson.version));

        // 如果是一个插件注册了多个视图，节点需要被 clone 才能生效，否则第一个视图 appendChild 之后节点就没了
        const newHead = cloneNode<HTMLHeadElement>(proxiedHead);
        disposables.push(useMutationObserver(proxiedHead, newHead));
        // 注册 icon 相关的样式
        const iconStyle = document.createElement('style');
        iconStyle.id = 'icon-style';
        iconStyle.innerHTML = iconService.currentTheme?.styleSheetContent;
        newHead.appendChild(iconStyle);
        disposables.push(iconService.onThemeChange((e) => {
            iconStyle.innerHTML = e.styleSheetContent;
        }));
        shadowRootElement.appendChild(newHead);
        const portalRoot = viewExtensionService.getPortalShadowRoot(extensionId);
        if (portalRoot) {
          portalRoot.appendChild(proxiedHead);
        }
      }
      if (!shadowRoot) {
        setShadowRoot(shadowRootElement);
      }

      themeService.getCurrentTheme().then((res) => setThemeType(res.type));
      disposables.push(themeService.onThemeChange((e) => {
        if (e.type && e.type !== themeType) {
          setThemeType(e.type);
        }
      }));
      return disposables.dispose.bind(disposables);
    }
  }, []);

  return (
    <div id={id} style={{ width: '100%', height: '100%' }} ref={shadowRootRef}>
      {shadowRoot && <ShadowContent root={shadowRoot}>
        <div className={clx(getThemeTypeSelector(themeType!), 'shadow-context-wrapper', 'show-file-icons')} style={{ width: '100%', height: '100%' }}>{children}</div>
      </ShadowContent>}
    </div>
  );
};

export function getShadowRoot(panel, extension: IExtension, props, id, proxiedHead) {
  const Component = panel;
  const { getIcon } = React.useContext(IconContext);
  const labelService = useInjectable<LabelService>(LabelService);
  const getResourceIcon = useCallback((uri: string, options: IIconResourceOptions) => {
    return labelService.getIcon(URI.parse(uri), options);
  }, []);

  return (
    <ComponentContextProvider value={{ getIcon, localize, getResourceIcon }}>
      <ShadowRoot id={`${extension.id}-${id}`} extensionId={extension.id} proxiedHead={proxiedHead}><Component {...props} /></ShadowRoot>
    </ComponentContextProvider>
  );
}