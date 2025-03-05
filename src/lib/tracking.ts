export interface TrackingConfig {
    debug?: boolean;
    trackingId: string;
    endpoint?: string;
  }
  
  declare global {
    interface Window {
      _lt: any[];
    }
  }
  
  export function initializeTracking(config: TrackingConfig): void {
    window._lt = window._lt || [];
    window._lt.push(['init', config.trackingId]);
    
    if (config.debug) {
      window._lt.push(['config', { debug: true }]);
    }
  }
  
  export function trackEvent(eventName: string, eventData?: Record<string, any>): void {
    window._lt.push(['event', { name: eventName, ...eventData }]);
  }