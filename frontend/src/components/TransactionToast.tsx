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
  pending: 'Executing',
  success: 'Operation Successful',
  error: 'Operation Failed'
};

const statusDescription: Record<TransactionToastStatus, (action: string) => string> = {
  pending: action => `Executing「${action}」`,
  success: action => `「${action}」Confirmed`,
  error: action => `「${action}」Failed`
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
          View Transaction
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
  
  // Update existing toast to success state, keeping the same toast instance
  Toast.info({
    id: id, // Use same ID to update pending toast
    duration: 4,
    showClose: true,
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

  // New: Update existing toast to error state
export const updateTransactionToastToError = (
  options: TransactionToastOptions & { id: string }
): void => {
  const { id, action, hash, message } = options;
  
  // Update existing toast to error state, keeping the same toast instance
  Toast.info({
    id: id, // Use same ID to update pending toast
    duration: 6,
    showClose: true,
    stack: true,
    content: (
      <TransactionToastContent status="error" action={action} hash={hash} message={message} />
    )
  });
};

export type { TransactionToastOptions };


