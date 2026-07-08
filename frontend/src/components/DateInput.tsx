import React from 'react';

/**
 * Date input that opens the native calendar picker on ANY click on the field
 * (by default browsers only open it from the tiny calendar icon). Typing still
 * works. `color-scheme: dark` renders the native picker in dark mode.
 */
export const DateInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({ style, onClick, ...props }) => (
  <input
    type="date"
    {...props}
    onClick={(e) => {
      try {
        e.currentTarget.showPicker?.();
      } catch {
        /* showPicker needs a user gesture + secure context; typing still works */
      }
      onClick?.(e);
    }}
    style={{ cursor: 'pointer', colorScheme: 'dark', ...style }}
  />
);
