declare namespace preact.JSX {
  interface IntrinsicElements {
    // ── Feedback ──────────────────────────────────────────────────────────
    's-spinner': { size?: string };
    's-divider': {};
    's-banner': { tone?: 'info' | 'success' | 'warning' | 'critical'; children?: any };
    's-badge': { tone?: string; progress?: string; children?: any };

    // ── Typography ────────────────────────────────────────────────────────
    's-heading': { children?: any };
    's-text': { tone?: string; children?: any };

    // ── Layout ────────────────────────────────────────────────────────────
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
    's-inline': {
      gap?: string;
      'block-align'?: string;
      children?: any;
    };

    // ── Actions ───────────────────────────────────────────────────────────
    's-button': {
      tone?: 'default' | 'critical';
      variant?: 'primary' | 'secondary' | 'plain' | 'monochromePlain';
      disabled?: boolean;
      onPress?: () => void;
      children?: any;
    };
    's-pressable': {
      onPress?: () => void;
      children?: any;
    };

    // ── Forms ─────────────────────────────────────────────────────────────
    's-checkbox': {
      checked?: boolean;
      onChange?: (e: any) => void;
      disabled?: boolean;
      children?: any;
    };
    's-select': {
      label?: string;
      value?: string;
      onChange?: (e: any) => void;
      children?: any;
    };
    's-option': {
      value: string;
      children?: any;
    };
    's-text-field': {
      label?: string;
      value?: string;
      type?: string;
      onChange?: (e: any) => void;
      children?: any;
    };

    // ── Print action ──────────────────────────────────────────────────────
    's-admin-print-action': {
      src?: string;
      children?: any;
    };
  }
}