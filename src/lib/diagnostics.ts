interface DiagnosticLog {
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    context: string;
    message: string;
    data?: any;
  }
  
  class Diagnostics {
    private static instance: Diagnostics;
    private logs: DiagnosticLog[] = [];
    private readonly MAX_LOGS = 100;
  
    private constructor() {}
  
    static getInstance(): Diagnostics {
      if (!Diagnostics.instance) {
        Diagnostics.instance = new Diagnostics();
      }
      return Diagnostics.instance;
    }
  
    private addLog(level: DiagnosticLog['level'], context: string, message: string, data?: any) {
      const log: DiagnosticLog = {
        timestamp: new Date().toISOString(),
        level,
        context,
        message,
        data
      };
  
      this.logs.unshift(log);
      if (this.logs.length > this.MAX_LOGS) {
        this.logs.pop();
      }
  
      // Also log to console in development
      if (import.meta.env.DEV) {
        console[level](`[${context}] ${message}`, data || '');
      }
  
      // Store in localStorage for persistence
      try {
        localStorage.setItem('app_diagnostics', JSON.stringify(this.logs));
      } catch (error) {
        console.error('Error storing diagnostics:', error);
      }
    }
  
    info(context: string, message: string, data?: any) {
      this.addLog('info', context, message, data);
    }
  
    warn(context: string, message: string, data?: any) {
      this.addLog('warn', context, message, data);
    }
  
    error(context: string, message: string, data?: any) {
      this.addLog('error', context, message, data);
    }
  
    getLogs(): DiagnosticLog[] {
      return this.logs;
    }
  
    clearLogs() {
      this.logs = [];
      localStorage.removeItem('app_diagnostics');
    }
  
    getDiagnosticReport(): string {
      const environment = {
        userAgent: navigator.userAgent,
        language: navigator.language,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        env: import.meta.env.MODE
      };
  
      return JSON.stringify({
        environment,
        logs: this.logs
      }, null, 2);
    }
  }
  
  export const diagnostics = Diagnostics.getInstance();