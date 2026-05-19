declare namespace preact.JSX {
  interface IntrinsicElements {
    's-spinner': { size?: string };
    's-divider': {};
    's-banner': { tone?: 'info' | 'success' | 'warning' | 'critical'; children?: any };
    's-badge': { tone?: string; progress?: string; children?: any };
    's-heading': { children?: any };
    's-box': {
      padding?: string;
      background?: string;
      'border-radius'?: string;
      children?: any;
    };
    's-stack': {
      direction?: 'block' | 'inline';
      gap?: string;
      children?: any;
    };
    's-text': {
      tone?: string;
      children?: any;
    };
    's-admin-print-action': {
      src?: string;
      children?: any;
    };
  }
}