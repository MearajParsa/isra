import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-72 p-6 flex flex-col items-center justify-center text-center rounded-3xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/10">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
            <AlertOctagon className="w-7 h-7" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">خطای غیرمنتظره در رابط کاربری</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
            متأسفانه هنگام پردازش این بخش خطایی رخ داد. می‌توانید صفحه را دوباره بارگذاری کنید.
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleReset}
              icon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              تلاش مجدد
            </Button>
            <Button size="sm" onClick={() => window.location.reload()}>
              بارگذاری مجدد صفحه
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
