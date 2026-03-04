import React, { createContext, useCallback, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CircleCheck, OctagonAlert, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

type MessageType = 'success' | 'error' | 'info' | 'warning';

interface MessageState {
  open: boolean;
  type: MessageType;
  message: string;
}

const defaultState: MessageState = { open: false, type: 'info', message: '' };

const globalHandlerRef: { current: ((opts: { type: MessageType; message: string }) => void) | null } = { current: null };

const MessageModalContext = createContext<{
  show: (opts: { type: MessageType; message: string }) => void;
} | null>(null);

function MessageModalProviderInner({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MessageState>(defaultState);

  const show = useCallback((opts: { type: MessageType; message: string }) => {
    setState({ open: true, type: opts.type, message: opts.message });
  }, []);

  React.useEffect(() => {
    globalHandlerRef.current = show;
    return () => {
      globalHandlerRef.current = null;
    };
  }, [show]);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const icons = {
    success: <CircleCheck className="h-6 w-6 text-green-600" />,
    error: <OctagonAlert className="h-6 w-6 text-destructive" />,
    info: <Info className="h-6 w-6 text-blue-600" />,
    warning: <TriangleAlert className="h-6 w-6 text-amber-600" />,
  };

  const titles = {
    success: '提示',
    error: '错误',
    info: '提示',
    warning: '注意',
  };

  return (
    <MessageModalContext.Provider value={{ show }}>
      {children}
      <AlertDialog open={state.open} onOpenChange={(open) => !open && close()}>
        <AlertDialogContent className="sm:max-w-md text-center">
          <AlertDialogHeader className="flex flex-col items-center gap-3">
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full',
                state.type === 'success' && 'bg-green-100',
                state.type === 'error' && 'bg-destructive/10',
                state.type === 'info' && 'bg-blue-100',
                state.type === 'warning' && 'bg-amber-100'
              )}
            >
              {icons[state.type]}
            </div>
            <AlertDialogTitle>{titles[state.type]}</AlertDialogTitle>
            <AlertDialogDescription className="text-left whitespace-pre-wrap">
              {state.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-center">
            <AlertDialogAction onClick={close} className="min-w-24">
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MessageModalContext.Provider>
  );
}

export function MessageModalProvider({ children }: { children: React.ReactNode }) {
  return <MessageModalProviderInner>{children}</MessageModalProviderInner>;
}

/** 全局弹窗提示，需用户点击「确定」关闭（替代原 toast） */
export const messageToast = {
  success: (message: string) => globalHandlerRef.current?.({ type: 'success', message }),
  error: (message: string) => globalHandlerRef.current?.({ type: 'error', message }),
  info: (message: string) => globalHandlerRef.current?.({ type: 'info', message }),
  warning: (message: string) => globalHandlerRef.current?.({ type: 'warning', message }),
};
