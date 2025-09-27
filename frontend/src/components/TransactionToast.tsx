import React from 'react';
import { Toast } from '@douyinfe/semi-ui';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';

const legacyRoots = new WeakMap<Element, ReturnType<typeof createRoot>>();

if (ReactDOM && typeof (ReactDOM as any).render !== 'function') {
  (ReactDOM as any).render = (element: React.ReactElement, container: Element) => {
    let root = legacyRoots.get(container);
    if (!root) {
      root = createRoot(container);
      legacyRoots.set(container, root);
    }
    root.render(element);
    return {
      unmount() {
        root?.unmount();
        legacyRoots.delete(container);
      }
    };
  };
}

if (ReactDOM && typeof (ReactDOM as any).unmountComponentAtNode !== 'function') {
  (ReactDOM as any).unmountComponentAtNode = (container: Element) => {
    const root = legacyRoots.get(container);
    if (root) {
      root.unmount();
      legacyRoots.delete(container);
    }
  };
}

const EXPLORER_BASE_URL = 'https://sepolia.etherscan.io/tx/';

type TransactionToastStatus = 'pending' | 'success' | 'error';

interface TransactionToastOptions {
  id?: string;
  action: string;
  hash?: string;
  message?: string;
}

const statusTitle: Record<TransactionToastStatus, string> = {
  pending: '正在执行',
  success: '操作成功',
  error: '操作失败'
};

const statusDescription: Record<TransactionToastStatus, (action: string) => string> = {
  pending: action => `正在执行「${action}」`,
  success: action => `「${action}」已确认`,
  error: action => `「${action}」执行失败`
};

interface TransactionToastContentProps {
  status: TransactionToastStatus;
  action: string;
  hash?: string;
  message?: string;
}

const TransactionToastContent: React.FC<TransactionToastContentProps> = ({
  status,
  action,
  hash,
  message
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontWeight: 600 }}>{statusTitle[status]}</span>
      <span>{statusDescription[status](action)}</span>
      {hash ? (
        <a
          href={`${EXPLORER_BASE_URL}${hash}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--semi-color-primary)' }}
        >
          查看交易
        </a>
      ) : null}
      {status === 'error' && message ? (
        <span style={{ color: 'var(--semi-color-text-2)', fontSize: 12 }}>{message}</span>
      ) : null}
    </div>
  );
};

const getToastId = ({ id, hash }: TransactionToastOptions): string => {
  if (id) {
    return id;
  }
  if (hash) {
    return `tx-${hash}`;
  }
  return `tx-${Date.now()}`;
};

export const showPendingTransactionToast = (options: TransactionToastOptions): string => {
  const toastId = getToastId(options);
  const { action, hash, message } = options;
  Toast.info({
    id: toastId,
    duration: 0,
    showClose: true,
    stack: true,
    content: (
      <TransactionToastContent status="pending" action={action} hash={hash} message={message} />
    )
  });
  return toastId;
};

export const showSuccessTransactionToast = (
  options: TransactionToastOptions & { id: string }
): void => {
  const { id, action, hash, message } = options;
  Toast.success({
    id,
    duration: 2,
    showClose: false,
    stack: true,
    content: (
      <TransactionToastContent status="success" action={action} hash={hash} message={message} />
    )
  });
};

export const showErrorTransactionToast = (options: TransactionToastOptions): string => {
  const toastId = getToastId(options);
  const { action, hash, message } = options;
  Toast.error({
    id: toastId,
    duration: 6,
    showClose: true,
    stack: true,
    content: (
      <TransactionToastContent status="error" action={action} hash={hash} message={message} />
    )
  });
  return toastId;
};

export type { TransactionToastOptions };


